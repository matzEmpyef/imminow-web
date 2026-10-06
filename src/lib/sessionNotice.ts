import { create } from 'zustand'

/**
 * Why the last session in this tab ended, when the person did not end it themselves (review
 * F-165). The login page reads it to say what happened, and to decide whether the person signing
 * in may be taken back to the page the session ended on.
 *
 *   expired   the server refused to renew the session
 *   idle      30 minutes without activity (the idle lock)
 *   absolute  the 12-hour cap (the idle lock)
 *
 * In memory only: it describes this tab, and a reload starts clean.
 */
export type SessionEndReason = 'expired' | 'idle' | 'absolute'

export interface SessionNotice {
  reason: SessionEndReason
  /** Whose session it was, when known: only the same person is returned to where they were. */
  userId: string | null
}

interface SessionNoticeState {
  notice: SessionNotice | null
  /** A different person signed in after a session ended here: they start at their own home. */
  returnBlocked: boolean
}

export const useSessionNoticeStore = create<SessionNoticeState>()(() => ({
  notice: null,
  returnBlocked: false,
}))

/** A session ended. No `reason` means the person chose to leave, which leaves nothing to say. */
export function noteSessionEnded(reason: SessionEndReason | undefined, userId: string | null) {
  useSessionNoticeStore.setState({ notice: reason ? { reason, userId } : null, returnBlocked: false })
}

/** A session began: the notice has done its job, and it decides whether this person may go back. */
export function noteSessionBegan(userId: string | undefined) {
  const { notice } = useSessionNoticeStore.getState()
  useSessionNoticeStore.setState({
    notice: null,
    returnBlocked: Boolean(notice?.userId && notice.userId !== userId),
  })
}

/** What the login page says for each reason. */
export const SESSION_END_MESSAGES: Record<SessionEndReason, string> = {
  expired: 'Your session has ended. Log in again to carry on where you left off.',
  idle: 'You were signed out after 30 minutes without activity.',
  absolute: 'You were signed out after 12 hours for security. Please sign in again.',
}

/** Router state the guards attach when they send a signed-out visitor to the login page. */
export interface LoginLocationState {
  from?: string
}

/** Only an address inside the console, and never the login page itself. */
function safeReturnPath(from: unknown): string | null {
  if (typeof from !== 'string' || !from.startsWith('/') || from.startsWith('//')) return null
  if (from === '/login' || from.startsWith('/login?') || from.startsWith('/login#')) return null
  return from
}

/**
 * Where to send someone who has just signed in, or `null` for their own home page. They go back
 * to the page they were on when the address is one of the console's own and, if a session ended
 * here, it was THEIR session: a different person signing in at the same desk starts at home.
 */
export function returnPathAfterSignIn(from: unknown): string | null {
  return useSessionNoticeStore.getState().returnBlocked ? null : safeReturnPath(from)
}
