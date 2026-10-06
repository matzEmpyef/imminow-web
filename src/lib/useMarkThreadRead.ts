import { useCallback, useEffect, useRef } from 'react'
import { useMarkClientRead } from '@/queries/clients'
import { useMarkInternalConversationRead } from '@/queries/internalMessages'
import { useMarkLeadRead } from '@/queries/leads'

export type ThreadKind = 'lead' | 'client' | 'internal'

/** At most one read marker a second, however fast messages arrive. */
const MIN_GAP_MS = 1000

/** The newest message the OTHER side sent, from a thread laid out oldest first. */
export function newestIncomingId<T extends { id: string }>(
  messages: readonly T[] | undefined,
  isMine: (message: T) => boolean,
): string | null | undefined {
  if (!messages) return undefined
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    if (!isMine(messages[i])) return messages[i].id
  }
  return null
}

/** Whether a person is looking at this tab: it is the visible tab and its window has focus. */
function isLooking(): boolean {
  return document.visibilityState === 'visible' && document.hasFocus()
}

/**
 * Marks a chat thread read — the ONE place all four chat screens do it (review F-143): the lead
 * and client conversation pages, Internal Messaging and the floating chat window.
 *
 *   - when the thread is opened, as each screen always did;
 *   - and whenever a new message from the other side appears while the thread is on screen and
 *     the person is looking (the tab is visible and its window has focus).
 *
 * The second is what was missing. The marker was sent only on open, so a message that arrived
 * while the consultant was reading the thread was shown but never marked read: the student's app
 * said "delivered", the unread count stayed up, and the drawer showed the thread as unread while
 * it was on screen, until the thread was closed and opened again.
 *
 * A message that arrives while the person is NOT looking (another tab, another window, the
 * floating window minimised) is left unread, correctly, and is marked the moment they come back.
 *
 * `newestIncoming` is the id of the newest message from the other side (`newestIncomingId`
 * above): `undefined` while the thread is still loading, `null` when there is none.
 * `shown` is false while the screen has the thread tucked away (the minimised floating window).
 */
export function useMarkThreadRead(
  kind: ThreadKind | null | undefined,
  id: string | null | undefined,
  newestIncoming: string | null | undefined,
  shown = true,
): void {
  // `mutate` is referentially stable (see `lib/useSave.ts`), so these are real dependencies.
  const { mutate: markLead } = useMarkLeadRead()
  const { mutate: markClient } = useMarkClientRead()
  const { mutate: markInternal } = useMarkInternalConversationRead()

  const lastSentAt = useRef(0)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  /** The newest incoming message a marker has been sent for (or that was there on open). */
  const covered = useRef<string | null | undefined>(undefined)
  /** One arrived while nobody was looking. */
  const waiting = useRef(false)
  const shownRef = useRef(shown)
  useEffect(() => {
    shownRef.current = shown
  }, [shown])

  const send = useCallback(() => {
    if (!kind || !id) return
    lastSentAt.current = Date.now()
    if (kind === 'lead') markLead(id)
    else if (kind === 'client') markClient(id)
    else markInternal(id)
  }, [kind, id, markLead, markClient, markInternal])

  /** Sends now, or as soon as a second has passed since the last one. Never twice for one wait. */
  const sendPaced = useCallback(() => {
    waiting.current = false
    if (timer.current) return
    const wait = lastSentAt.current + MIN_GAP_MS - Date.now()
    if (wait <= 0) {
      send()
      return
    }
    timer.current = setTimeout(() => {
      timer.current = null
      send()
    }, wait)
  }, [send])

  // On open: as before. Everything already in the thread is covered by this one.
  useEffect(() => {
    covered.current = undefined
    waiting.current = false
    if (kind && id) send()
    return () => {
      if (timer.current) clearTimeout(timer.current)
      timer.current = null
    }
  }, [kind, id, send])

  // On arrival.
  useEffect(() => {
    if (!kind || !id || newestIncoming === undefined) return
    if (covered.current === undefined) {
      // The first look at the loaded thread: the marker sent on open already covers it.
      covered.current = newestIncoming
      return
    }
    if (newestIncoming === null || newestIncoming === covered.current) return
    covered.current = newestIncoming
    if (shownRef.current && isLooking()) sendPaced()
    else waiting.current = true
  }, [kind, id, newestIncoming, sendPaced])

  // On coming back: to the tab, to the window, or to a thread that had been tucked away.
  useEffect(() => {
    const onReturn = () => {
      if (waiting.current && shownRef.current && isLooking()) sendPaced()
    }
    if (shown) onReturn()
    window.addEventListener('focus', onReturn)
    document.addEventListener('visibilitychange', onReturn)
    return () => {
      window.removeEventListener('focus', onReturn)
      document.removeEventListener('visibilitychange', onReturn)
    }
  }, [shown, sendPaced])
}
