import {
  clearIdleChannel,
  pruneStaleIdleClocks,
  readLastActivity,
  readSessionStart,
  subscribeToActivityFromOtherTabs,
  writeLastActivity,
  writeSessionStart,
} from './activityChannel'
import { setIdleWarning } from './store'

/** Warn at 28 minutes idle, lock at 30 (PROGRESS.md Pre-Production Checklist "Idle auto-lock";
 * TRD Section 9, REVIEW_TRIAGE item 24 — console sessions only; the student app has no idle lock). */
export const IDLE_WARNING_MS = 28 * 60 * 1000
export const IDLE_LOCK_MS = 30 * 60 * 1000
/** Absolute cap from sign-in time, regardless of activity. The real backend enforces the same 12h
 * on `auth_sessions`; this just keeps the client's own clock from ever outlasting what the server
 * would allow, and makes the sign-out clean instead of "the next request happens to 401." */
export const ABSOLUTE_CAP_MS = 12 * 60 * 60 * 1000

/** How often the manager re-checks the shared clock. 1s keeps the warning countdown visibly live
 * and costs nothing at this frequency. */
const TICK_MS = 1000

/** Local activity is shared to other tabs at most this often — a scroll or a run of keystrokes
 * does not need its own `localStorage` write every time. This tab's OWN idle clock still resets
 * immediately (see `recordActivity`); only the value OTHER tabs see is throttled. */
const ACTIVITY_WRITE_THROTTLE_MS = 10_000

export type IdleLockReason = 'idle' | 'absolute'

export interface IdleLockManagerDeps {
  /** Ends the session and explains why — `lockSession` in `bootstrap.ts`, which uses the same
   * `endSession()` the Log out button and the 401 interceptor use. */
  onLock: (reason: IdleLockReason) => void
  /** "Stay signed in": a normal authenticated call so the SERVER also sees activity, not only this
   * client's clock — the real backend refuses a refresh after 30 minutes idle (`auth_sessions`),
   * so a refresh made here, before that mark, is itself the activity signal. Failures are the
   * caller's problem to ignore; this manager doesn't need to know why a refresh didn't land. */
  refreshSession: () => Promise<void>
  /** Which session this tab is signed in to — `sessionKeyFromRefreshToken` of the stored refresh
   * token in `bootstrap.ts`. Read once per `start()`; the shared clock is kept under it, so values
   * left behind by an earlier session are never mistaken for this one's. */
  sessionKey: () => string | null
  /** Defaults to `Date.now`; tests inject a controllable clock. */
  now?: () => number
}

/**
 * One instance per signed-in tab (`bootstrap.ts` starts/stops it on the same sign-in/sign-out edges
 * as `RealtimeConnectionManager`). Tracks pointer/keyboard/scroll/focus activity, shares it with
 * other tabs via `localStorage` (`activityChannel.ts`), and every second compares the shared clock
 * against the 28-minute warning, the 30-minute lock, and the 12-hour absolute cap. Deliberately NOT
 * a React component or hook — it has to run before anything mounts and keep running across route
 * changes; `store.ts`'s `useIdleLockStore` is how the warning modal reads its state.
 */
export class IdleLockManager {
  private readonly deps: IdleLockManagerDeps
  private readonly now: () => number
  private running = false
  private tickTimer: ReturnType<typeof setInterval> | null = null
  private unsubscribeStorage: (() => void) | null = null
  private unsubscribeActivityEvents: (() => void) | null = null
  /** This tab's own view of "last activity," updated immediately on every tracked event —
   * independent of the throttled write to the shared channel, so this tab's warning clears the
   * instant it sees its own activity rather than waiting on its own throttle window. */
  private lastLocalActivity = 0
  private lastWrittenActivity = 0
  private sessionKey: string | null = null
  /** This tab's own copy of the session's start time — what the 12-hour cap falls back on when
   * the shared value is gone (storage unavailable, or another tab of this session signed out and
   * cleared it), so the cap can never silently stop applying. */
  private sessionStart = 0
  private warning = false

  constructor(deps: IdleLockManagerDeps) {
    this.deps = deps
    // NOT `deps.now ?? Date.now` — that captures today's `Date.now` function object once, at
    // construction time. This manager is a long-lived singleton built at module-load time
    // (`bootstrap.ts`), so a test installing fake timers afterwards (as `vi.useFakeTimers()`
    // replaces the global `Date`) would never be seen by an already-captured reference. Calling
    // through a wrapper looks up the current global `Date` on every tick instead.
    this.now = deps.now ?? (() => Date.now())
  }

  /** Idempotent — matches `RealtimeConnectionManager.start()`'s shape. `fresh` is the sign-in
   * edge: the clock always starts from now, whatever storage holds. Without it (a reload, or a
   * duplicated tab joining mid-session) the session's existing shared clock is adopted. */
  start({ fresh = false }: { fresh?: boolean } = {}): void {
    if (this.running) return
    this.running = true
    const now = this.now()
    this.sessionKey = this.deps.sessionKey()
    pruneStaleIdleClocks(this.sessionKey, now, ABSOLUTE_CAP_MS)
    if (fresh) clearIdleChannel(this.sessionKey)
    this.sessionStart = readSessionStart(this.sessionKey) ?? now
    this.lastLocalActivity = readLastActivity(this.sessionKey) ?? now
    this.lastWrittenActivity = this.lastLocalActivity
    // Seeds the channel for the very first tab of a session, and re-confirms it for a second tab
    // opening mid-session — harmless either way since it's the same value already there.
    writeLastActivity(this.sessionKey, this.lastLocalActivity)
    writeSessionStart(this.sessionKey, this.sessionStart)
    this.warning = false
    setIdleWarning(false, 0)
    this.attachActivityListeners()
    this.unsubscribeStorage = subscribeToActivityFromOtherTabs(this.sessionKey, () => this.onSharedActivity())
    this.tickTimer = setInterval(() => this.tick(), TICK_MS)
  }

  /** Stops for good until the next `start()` — signed out, or this manager just locked the
   * session. Clears this session's shared clock too (other tabs of the same session keep their own
   * in-memory copy of its start and end on the same sign-out or lock). */
  stop(): void {
    if (!this.running) return
    this.running = false
    if (this.tickTimer) clearInterval(this.tickTimer)
    this.tickTimer = null
    this.unsubscribeStorage?.()
    this.unsubscribeStorage = null
    this.detachActivityListeners()
    this.warning = false
    setIdleWarning(false, 0)
    clearIdleChannel(this.sessionKey)
  }

  /** The warning modal's "Stay signed in" button: counts as activity in every tab right away (not
   * throttled — the whole point is to end the warning everywhere now, not up to
   * `ACTIVITY_WRITE_THROTTLE_MS` later), then asks the server to see the same thing. */
  staySignedIn(): void {
    this.recordActivity(true)
    void this.deps.refreshSession()
  }

  private recordActivity(forceWrite = false): void {
    const now = this.now()
    this.lastLocalActivity = now
    if (forceWrite || now - this.lastWrittenActivity >= ACTIVITY_WRITE_THROTTLE_MS) {
      this.lastWrittenActivity = now
      writeLastActivity(this.sessionKey, now)
    }
    if (this.warning) {
      this.warning = false
      setIdleWarning(false, 0)
    }
  }

  /** Another tab wrote a newer activity timestamp than we've observed. Adopt it and clear our own
   * warning immediately, without waiting for the next tick. */
  private onSharedActivity(): void {
    const shared = readLastActivity(this.sessionKey)
    if (shared != null && shared > this.lastLocalActivity) this.lastLocalActivity = shared
    if (this.warning) {
      this.warning = false
      setIdleWarning(false, 0)
    }
  }

  private attachActivityListeners(): void {
    const handler = () => this.recordActivity()
    // Pointer, keyboard, scroll, focus — deliberately NOT `mousemove`, which would fire on every
    // pixel and defeat the point of throttling. Background polling and realtime frames never touch
    // any of these, so they never count as activity (as required).
    document.addEventListener('pointerdown', handler)
    document.addEventListener('keydown', handler)
    document.addEventListener('scroll', handler, { capture: true, passive: true })
    window.addEventListener('focus', handler)
    this.unsubscribeActivityEvents = () => {
      document.removeEventListener('pointerdown', handler)
      document.removeEventListener('keydown', handler)
      document.removeEventListener('scroll', handler, { capture: true })
      window.removeEventListener('focus', handler)
    }
  }

  private detachActivityListeners(): void {
    this.unsubscribeActivityEvents?.()
    this.unsubscribeActivityEvents = null
  }

  private tick(): void {
    if (!this.running) return
    const now = this.now()

    // The 12-hour cap wins outright — it fires regardless of activity, including while the idle
    // warning is already showing.
    const sessionStart = readSessionStart(this.sessionKey) ?? this.sessionStart
    if (now - sessionStart >= ABSOLUTE_CAP_MS) {
      this.triggerLock('absolute')
      return
    }

    // Adopt whatever the shared channel has in case another tab wrote more recently than we've
    // observed via the storage event (e.g. this tab was backgrounded and throttled by the browser).
    const shared = readLastActivity(this.sessionKey)
    if (shared != null && shared > this.lastLocalActivity) this.lastLocalActivity = shared

    const idleFor = now - this.lastLocalActivity
    if (idleFor >= IDLE_LOCK_MS) {
      this.triggerLock('idle')
      return
    }
    if (idleFor >= IDLE_WARNING_MS) {
      const secondsRemaining = Math.max(0, Math.ceil((IDLE_LOCK_MS - idleFor) / 1000))
      this.warning = true
      setIdleWarning(true, secondsRemaining)
    } else if (this.warning) {
      this.warning = false
      setIdleWarning(false, 0)
    }
  }

  private triggerLock(reason: IdleLockReason): void {
    this.stop()
    this.deps.onLock(reason)
  }
}
