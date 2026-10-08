import { act, renderHook } from '@testing-library/react'
import { QueryClient } from '@tanstack/react-query'
import { describe, expect, it, vi } from 'vitest'
import { ApiError } from '@/api/errors'
import {
  CASE_CLOSED_CHAT_NOTE,
  CLOSED_CONVERSATION_NOTE,
  closedThreadRefusal,
  isCaseChatClosed,
  refreshIfThreadClosed,
  useClosedThread,
} from './closedThread'

// A closed conversation is read-only (owner ruling 2026-10-06, review F-086/F-115). One place
// decides which cases are closed for chat, recognises the server's refusal, and holds a screen's
// read-only state, so the full conversation pages, the floating window and Course Finder agree.
const refusal = (code: string, message: string) => new ApiError('Could not send this message.', { error: { code, message } }, 409)

describe('which chats are closed', () => {
  it('a closed or completed case, and nothing else', () => {
    expect(isCaseChatClosed('closed')).toBe(true)
    expect(isCaseChatClosed('closed_completed')).toBe(true)
    // A case that moved away keeps its own rule, banner and wording.
    expect(isCaseChatClosed('closed_switched')).toBe(false)
    expect(isCaseChatClosed('in_plan')).toBe(false)
    expect(isCaseChatClosed('in_dispute')).toBe(false)
    expect(isCaseChatClosed(undefined)).toBe(false)
  })

  it('reads the server refusal, in its own words, and no other failure', () => {
    expect(closedThreadRefusal(refusal('case_closed', 'This case is closed, so its chat is read-only.'))).toBe(
      CASE_CLOSED_CHAT_NOTE,
    )
    expect(closedThreadRefusal(refusal('lead_closed', 'This conversation is closed, so no new messages can be sent.'))).toBe(
      'This conversation is closed, so no new messages can be sent.',
    )
    expect(closedThreadRefusal(refusal('lead_closed', ''))).toBe('Could not send this message.')
    expect(closedThreadRefusal(refusal('case_moved', 'Moved.'))).toBeNull()
    expect(closedThreadRefusal(refusal('duplicate_share', 'Again.'))).toBeNull()
    expect(closedThreadRefusal(new Error('offline'))).toBeNull()
  })

  it('reads the lead or case again after such a refusal, and only then', () => {
    const queryClient = new QueryClient()
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries')
    refreshIfThreadClosed(queryClient, 'client', 'c1', refusal('duplicate_share', 'Again.'))
    expect(invalidate).not.toHaveBeenCalled()

    refreshIfThreadClosed(queryClient, 'client', 'c1', refusal('case_closed', 'Closed.'))
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['clients', 'c1'], exact: true })
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['conversations'] })

    refreshIfThreadClosed(queryClient, 'lead', 'l1', refusal('lead_closed', 'Closed.'))
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['leads', 'l1'], exact: true })
  })
})

describe('a screen’s read-only state', () => {
  it('follows the record', () => {
    const { result, rerender } = renderHook(({ closed }) => useClosedThread('c1', closed, CASE_CLOSED_CHAT_NOTE), {
      initialProps: { closed: false },
    })
    expect(result.current.closed).toBe(false)
    rerender({ closed: true })
    expect(result.current.closed).toBe(true)
    expect(result.current.note).toBe(CASE_CLOSED_CHAT_NOTE)
  })

  it('goes read-only at once on a refusal, with the server sentence, and opens again after a reopen', () => {
    const { result, rerender } = renderHook(({ closed }) => useClosedThread('l1', closed, CLOSED_CONVERSATION_NOTE), {
      initialProps: { closed: false },
    })
    let handled = true
    act(() => {
      handled = result.current.noteRefusal(new Error('offline'))
    })
    expect(handled).toBe(false)
    expect(result.current.closed).toBe(false)

    act(() => {
      handled = result.current.noteRefusal(refusal('lead_closed', 'This conversation is closed, so no new messages can be sent.'))
    })
    expect(handled).toBe(true)
    expect(result.current.closed).toBe(true)
    expect(result.current.note).toBe('This conversation is closed, so no new messages can be sent.')

    // The lead is read again and says closed; then it is reopened.
    rerender({ closed: true })
    expect(result.current.closed).toBe(true)
    rerender({ closed: false })
    expect(result.current.closed).toBe(false)
    expect(result.current.note).toBe(CLOSED_CONVERSATION_NOTE)
  })

  it('keeps a refusal to the thread it came from', () => {
    const { result, rerender } = renderHook(({ id }) => useClosedThread(id, false, CASE_CLOSED_CHAT_NOTE), {
      initialProps: { id: 'c1' },
    })
    act(() => {
      result.current.noteRefusal(refusal('case_closed', CASE_CLOSED_CHAT_NOTE))
    })
    expect(result.current.closed).toBe(true)
    rerender({ id: 'c2' })
    expect(result.current.closed).toBe(false)
  })
})
