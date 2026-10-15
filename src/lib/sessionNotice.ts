import { create } from 'zustand'

/**
 * Why the last session in this tab ended, when the person did not end it themselves (review
 * F-165). The login page reads it to say what happened. Signing in again always starts at the
 * person's own dashboard (owner's decision 151), never at the page the last session ended on.
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
  /** Whose session it was, when known. */
  userId: string | null
}

interface SessionNoticeState {
  notice: SessionNotice | null
}

export const useSessionNoticeStore = create<SessionNoticeState>()(() => ({
  notice: null,
}))

/** A session ended. No `reason` means the person chose to leave, which leaves nothing to say. */
export function noteSessionEnded(reason: SessionEndReason | undefined, userId: string | null) {
  useSessionNoticeStore.setState({ notice: reason ? { reason, userId } : null })
}

/** A session began: the notice has done its job. */
export function noteSessionBegan() {
  useSessionNoticeStore.setState({ notice: null })
}

/** What the login page says for each reason. */
export const SESSION_END_MESSAGES: Record<SessionEndReason, string> = {
  expired: 'Your session has ended. Please log in again.',
  idle: 'You were signed out after 30 minutes without activity.',
  absolute: 'You were signed out after 12 hours for security. Please sign in again.',
}

/**
 * Router state the guards attach when they send a signed-out visitor to the login page. Signing in
 * does not use it: everyone lands on their own dashboard (owner's decision 151).
 */
export interface LoginLocationState {
  from?: string
}
