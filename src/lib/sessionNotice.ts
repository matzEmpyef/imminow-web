import { create } from 'zustand'
import { canRoleOpenPath, roleHomePath } from '@/lib/roleHome'

/**
 * Why the last session in this tab ended, when the person did not end it themselves (review
 * F-165), and where a person goes after signing in (owner's decision 151, as amended).
 *
 *   expired   the server refused to renew the session
 *   idle      30 minutes without activity (the idle lock)
 *   absolute  the 12-hour cap (the idle lock)
 *
 * After a successful sign-in a person goes to:
 *   1. the page they opened while signed out, when the guard sent them to the login page in this
 *      tab within the last 30 minutes;
 *   2. otherwise the page their own session ended on, when the same person signs in again within
 *      12 hours of it ending;
 *   3. otherwise their own role's dashboard. That includes a different person signing in on the
 *      same computer, and any page their role cannot open.
 * A page that was kept is used once and then forgotten.
 *
 * In memory only: it describes this tab, and a reload starts clean.
 */
export type SessionEndReason = 'expired' | 'idle' | 'absolute'

/** A link opened while signed out is followed only when the guard sent the person here this recently. */
export const LINK_MAX_AGE_MS = 30 * 60 * 1000
/** The page a session ended on is offered back to the same person for this long. */
export const RETURN_PAGE_MAX_AGE_MS = 12 * 60 * 60 * 1000

export interface SessionNotice {
  reason: SessionEndReason
  /** Whose session it was, when known. */
  userId: string | null
}

/** The page a session ended on, kept with whose session it was and when it ended. */
interface ReturnPage {
  path: string
  userId: string
  at: number
}

interface SessionNoticeState {
  notice: SessionNotice | null
  /** Set when a session ends on its own; becomes `resumePage` only if the same person signs in. */
  returnPage: ReturnPage | null
  /** The same person has just signed in: the page their last session ended on, used once. */
  resumePage: ReturnPage | null
}

export const useSessionNoticeStore = create<SessionNoticeState>()(() => ({
  notice: null,
  returnPage: null,
  resumePage: null,
}))

/** An address inside the console that is safe to send someone to: never the login or link pages. */
function safePath(path: unknown): string | null {
  // A backslash is read as a slash by browsers (`/\host` is `//host`), as `isInAppPath` already knows.
  if (typeof path !== 'string' || !path.startsWith('/') || path.startsWith('//') || path.includes('\\')) return null
  const pathname = path.split(/[?#]/)[0]
  if (pathname === '/' || pathname === '') return null
  if (/^\/(login|forgot-password|reset-password|set-password|guardian|webinar)(\/|$)/.test(pathname)) return null
  return path
}

/**
 * A session ended. No `reason` means the person chose to leave, which leaves nothing to say and no
 * page to return to. `page` is where they were; it is kept only with a known person, so that only
 * that person can be taken back to it.
 */
export function noteSessionEnded(reason: SessionEndReason | undefined, userId: string | null, page?: string | null) {
  const path = reason && userId ? safePath(page) : null
  useSessionNoticeStore.setState({
    notice: reason ? { reason, userId } : null,
    returnPage: path && userId ? { path, userId, at: Date.now() } : null,
    resumePage: null,
  })
}

/**
 * A session began: the notice has done its job, and the page the last session ended on is kept for
 * this person only if it was theirs and is still fresh. Anyone else's is thrown away.
 */
export function noteSessionBegan(userId?: string | null) {
  const { returnPage } = useSessionNoticeStore.getState()
  const mine = returnPage && userId && returnPage.userId === userId && Date.now() - returnPage.at < RETURN_PAGE_MAX_AGE_MS
  useSessionNoticeStore.setState({ notice: null, returnPage: null, resumePage: mine ? returnPage : null })
}

/**
 * Where a person who has just signed in goes. `from` and `at` are what the route guard left in the
 * login page's router state (the address opened while signed out, and when). Whatever page was kept
 * for them is used up here, whether or not it is followed.
 */
export function landingPathAfterSignIn(args: {
  role: Parameters<typeof roleHomePath>[0]
  from?: unknown
  at?: unknown
}): string {
  const { resumePage } = useSessionNoticeStore.getState()
  useSessionNoticeStore.setState({ resumePage: null })
  const now = Date.now()
  const candidates: (string | null)[] = []
  if (typeof args.at === 'number' && now - args.at >= 0 && now - args.at < LINK_MAX_AGE_MS) {
    candidates.push(safePath(args.from))
  }
  if (resumePage && now - resumePage.at < RETURN_PAGE_MAX_AGE_MS) candidates.push(safePath(resumePage.path))
  for (const path of candidates) {
    if (path && canRoleOpenPath(args.role, path)) return path
  }
  return roleHomePath(args.role)
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
  /** When the guard sent them (`Date.now()`): an old link left in the browser's history is not followed. */
  at?: number
}
