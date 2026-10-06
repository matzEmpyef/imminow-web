import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const markLead = vi.fn()
const markClient = vi.fn()
const markInternal = vi.fn()
vi.mock('@/queries/leads', () => ({ useMarkLeadRead: () => ({ mutate: markLead }) }))
vi.mock('@/queries/clients', () => ({ useMarkClientRead: () => ({ mutate: markClient }) }))
vi.mock('@/queries/internalMessages', () => ({ useMarkInternalConversationRead: () => ({ mutate: markInternal }) }))

import floatingChatWindow from '@/components/FloatingChatWindow.tsx?raw'
import internalMessagingPage from '@/features/administration/InternalMessagingPage.tsx?raw'
import clientConversationPage from '@/features/clients/ClientConversationPage.tsx?raw'
import leadConversationPage from '@/features/sales/LeadConversationPage.tsx?raw'
import { newestIncomingId, useMarkThreadRead, type ThreadKind } from './useMarkThreadRead'

// Review F-143: a message that arrives while the consultant is looking at the thread is marked
// read. Before, the marker went only when a thread was opened, so the student saw "delivered"
// and the unread count stayed up while the thread was on screen.
let visible = true
let focused = true

function look(next: { visible?: boolean; focused?: boolean }) {
  if (next.visible !== undefined) visible = next.visible
  if (next.focused !== undefined) focused = next.focused
  act(() => {
    document.dispatchEvent(new Event('visibilitychange'))
    window.dispatchEvent(new Event('focus'))
  })
}

function open(kind: ThreadKind = 'lead', id = 'lead-1') {
  return renderHook(
    ({ newest, shown }: { newest: string | null | undefined; shown: boolean }) => useMarkThreadRead(kind, id, newest, shown),
    { initialProps: { newest: undefined as string | null | undefined, shown: true } },
  )
}

beforeEach(() => {
  vi.useFakeTimers()
  markLead.mockClear()
  markClient.mockClear()
  markInternal.mockClear()
  visible = true
  focused = true
  vi.spyOn(document, 'visibilityState', 'get').mockImplementation(() => (visible ? 'visible' : 'hidden'))
  vi.spyOn(document, 'hasFocus').mockImplementation(() => focused)
})

afterEach(() => {
  vi.useRealTimers()
})

describe('useMarkThreadRead', () => {
  it('marks the thread read when it is opened, once, including after its messages load', () => {
    const hook = open()
    expect(markLead).toHaveBeenCalledTimes(1)
    expect(markLead).toHaveBeenCalledWith('lead-1')
    // The thread loads: what was already in it is covered by the marker sent on open.
    hook.rerender({ newest: 'm-1', shown: true })
    vi.advanceTimersByTime(5000)
    expect(markLead).toHaveBeenCalledTimes(1)
  })

  it('marks it read again when a new message from the other side arrives while being looked at', () => {
    const hook = open()
    hook.rerender({ newest: 'm-1', shown: true })
    vi.advanceTimersByTime(5000)

    hook.rerender({ newest: 'm-2', shown: true })
    expect(markLead).toHaveBeenCalledTimes(2)
  })

  it('does nothing when the list re-renders without a new incoming message', () => {
    const hook = open()
    hook.rerender({ newest: 'm-1', shown: true })
    vi.advanceTimersByTime(5000)
    hook.rerender({ newest: 'm-1', shown: true })
    hook.rerender({ newest: 'm-1', shown: true })
    expect(markLead).toHaveBeenCalledTimes(1)
  })

  it('sends at most one marker a second, and still covers the last message of a burst', () => {
    const hook = open()
    hook.rerender({ newest: 'm-1', shown: true })
    vi.advanceTimersByTime(5000)

    hook.rerender({ newest: 'm-2', shown: true })
    hook.rerender({ newest: 'm-3', shown: true })
    hook.rerender({ newest: 'm-4', shown: true })
    expect(markLead).toHaveBeenCalledTimes(2) // m-2 at once

    vi.advanceTimersByTime(999)
    expect(markLead).toHaveBeenCalledTimes(2)
    vi.advanceTimersByTime(1)
    expect(markLead).toHaveBeenCalledTimes(3) // one more for m-3 and m-4 together
    vi.advanceTimersByTime(5000)
    expect(markLead).toHaveBeenCalledTimes(3)
  })

  it.each([
    ['the tab is in the background', { visible: false }],
    ['the window does not have focus', { focused: false }],
  ])('leaves a message unread while %s, and marks it the moment the person is back', (_name, away) => {
    const hook = open()
    hook.rerender({ newest: 'm-1', shown: true })
    vi.advanceTimersByTime(5000)
    look(away)

    hook.rerender({ newest: 'm-2', shown: true })
    vi.advanceTimersByTime(5000)
    expect(markLead).toHaveBeenCalledTimes(1) // not read: nobody saw it

    look({ visible: true, focused: true })
    expect(markLead).toHaveBeenCalledTimes(2)
  })

  it('coming back with nothing new sends nothing', () => {
    const hook = open()
    hook.rerender({ newest: 'm-1', shown: true })
    look({ focused: false })
    look({ focused: true })
    expect(markLead).toHaveBeenCalledTimes(1)
  })

  it('treats a minimised floating window as not being looked at, until it is restored', () => {
    const hook = open()
    hook.rerender({ newest: 'm-1', shown: true })
    vi.advanceTimersByTime(5000)

    hook.rerender({ newest: 'm-1', shown: false })
    hook.rerender({ newest: 'm-2', shown: false })
    vi.advanceTimersByTime(5000)
    expect(markLead).toHaveBeenCalledTimes(1)

    hook.rerender({ newest: 'm-2', shown: true })
    expect(markLead).toHaveBeenCalledTimes(2)
  })

  it('uses the right marker for each kind of thread', () => {
    open('client', 'client-5')
    open('internal', 'team')
    expect(markClient).toHaveBeenCalledWith('client-5')
    expect(markInternal).toHaveBeenCalledWith('team')
    expect(markLead).not.toHaveBeenCalled()
  })

  it('starts over when another thread is opened', () => {
    const hook = renderHook(({ id, newest }: { id: string; newest: string | undefined }) => useMarkThreadRead('lead', id, newest), {
      initialProps: { id: 'lead-1', newest: 'm-1' as string | undefined },
    })
    hook.rerender({ id: 'lead-2', newest: undefined })
    expect(markLead).toHaveBeenLastCalledWith('lead-2')
    // lead-2's own messages load: covered by its open marker, not a new arrival.
    hook.rerender({ id: 'lead-2', newest: 'x-9' })
    vi.advanceTimersByTime(5000)
    expect(markLead).toHaveBeenCalledTimes(2)
  })
})

describe('newestIncomingId', () => {
  const mine = (m: { mine: boolean }) => m.mine
  it('is the last message the other side sent', () => {
    const thread = [
      { id: 'a', mine: false },
      { id: 'b', mine: true },
      { id: 'c', mine: false },
      { id: 'd', mine: true },
    ]
    expect(newestIncomingId(thread, mine)).toBe('c')
  })
  it('is null when the other side has sent nothing, and undefined while the thread is loading', () => {
    expect(newestIncomingId([{ id: 'a', mine: true }], mine)).toBeNull()
    expect(newestIncomingId([], mine)).toBeNull()
    expect(newestIncomingId<{ id: string; mine: boolean }>(undefined, mine)).toBeUndefined()
  })
})

describe('the four chat screens', () => {
  const chatScreens: Record<string, string> = {
    'the floating chat window': floatingChatWindow,
    'the lead conversation page': leadConversationPage,
    'the client conversation page': clientConversationPage,
    'Internal Messaging': internalMessagingPage,
  }
  it.each(Object.keys(chatScreens))('%s marks read through the shared hook only', (name) => {
    const source = chatScreens[name]
    expect(source).toMatch(/useMarkThreadRead\(/)
    expect(source).not.toMatch(/useMark(Lead|Client|InternalConversation)Read/)
  })
})
