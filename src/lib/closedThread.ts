import { useCallback, useEffect, useRef, useState } from 'react'
import type { QueryClient } from '@tanstack/react-query'
import { ApiError } from '@/api/errors'

/**
 * A closed conversation is read-only (owner ruling 2026-10-06, review F-086/F-115). The server
 * refuses every write into the thread of a closed lead (409 `lead_closed`) and of a case that is
 * `closed` or `closed_completed` (409 `case_closed`): the plain send, the shares, a suggested
 * course. Every screen with a composer or such an action asks here, so they all draw the same
 * line and say the same thing.
 *
 * A case that MOVED to another consultancy (`closed_switched`) is not this rule: it has its own
 * banner and wording (`lib/clientStatus.ts`).
 */

/** What stands in place of the composer on a closed case. The server's own sentence. */
export const CASE_CLOSED_CHAT_NOTE = 'This case is closed, so its chat is read-only.'

/** What stands in place of the composer on a closed lead, and on a closed row of the chat list. */
export const CLOSED_CONVERSATION_NOTE = 'This conversation is closed and read-only.'

/**
 * The sentence for a closed lead's banner: the server's own reason line first ("The student ended
 * this chat."), then the read-only note. The reason is written for the reader and shown as it is.
 */
export function closedLeadNote(lead: { closed_reason_label?: string | null } | null | undefined): string {
  const reason = lead?.closed_reason_label?.trim()
  return reason ? `${reason} ${CLOSED_CONVERSATION_NOTE}` : CLOSED_CONVERSATION_NOTE
}

/** What an empty thread says. A closed one is read-only, so it does not invite anyone to say hello. */
export const EMPTY_THREAD_TEXT = 'No messages yet — say hello.'
export const EMPTY_CLOSED_THREAD_TEXT = 'No messages in this conversation.'

export function emptyThreadText(closed: boolean | undefined): string {
  return closed ? EMPTY_CLOSED_THREAD_TEXT : EMPTY_THREAD_TEXT
}

/** The case has ended, so nothing more is written into its chat. */
export function isCaseChatClosed(status: string | null | undefined): boolean {
  return status === 'closed' || status === 'closed_completed'
}

/** The server's sentence when it refused a write because the thread is closed; null for anything else. */
export function closedThreadRefusal(error: unknown): string | null {
  if (!(error instanceof ApiError)) return null
  if (error.code === 'case_closed') return error.message || CASE_CLOSED_CHAT_NOTE
  if (error.code === 'lead_closed') return error.message || CLOSED_CONVERSATION_NOTE
  return null
}

/**
 * For the saves that write into a thread: a "closed" refusal means the lead or case on screen is
 * out of date (a colleague closed it a moment ago), so it is read again and every screen showing
 * it takes its read-only state. The chat list is read again too, since the row has left it.
 */
export function refreshIfThreadClosed(queryClient: QueryClient, kind: 'lead' | 'client', id: string, error: unknown) {
  if (closedThreadRefusal(error) === null) return
  queryClient.invalidateQueries({ queryKey: [kind === 'lead' ? 'leads' : 'clients', id], exact: true })
  queryClient.invalidateQueries({ queryKey: ['conversations'] })
}

/**
 * One conversation screen's read-only state. `recordClosed` is what the lead or case itself says;
 * `noteRefusal` is handed every failed write, and on a "closed" refusal the screen goes read-only
 * at once, showing the server's sentence, without waiting for the record to be read again.
 * Reopening (the record leaves its closed state) brings the composer back.
 */
export function useClosedThread(threadKey: string | null, recordClosed: boolean, note: string) {
  const [refused, setRefused] = useState<{ key: string | null; message: string } | null>(null)
  const wasClosed = useRef(recordClosed)
  useEffect(() => {
    if (wasClosed.current && !recordClosed) setRefused(null)
    wasClosed.current = recordClosed
  }, [recordClosed])

  /** True when the failure was a "closed" refusal, which this has now taken care of showing. */
  const noteRefusal = useCallback(
    (error: unknown): boolean => {
      const message = closedThreadRefusal(error)
      if (message === null) return false
      setRefused({ key: threadKey, message })
      return true
    },
    [threadKey],
  )

  // A refusal belongs to the thread it came from (the floating window moves between threads).
  const refusedHere = refused !== null && refused.key === threadKey ? refused.message : null
  return { closed: recordClosed || refusedHere !== null, note: refusedHere ?? note, noteRefusal }
}
