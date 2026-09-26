// Cross-tab activity + session-start timestamps for the console's idle lock (PROGRESS.md
// Pre-Production Checklist "Idle auto-lock"; TRD Section 9 / REVIEW_TRIAGE item 24 — console
// sessions only). `authStore` persists to sessionStorage, which is per-tab; `localStorage` is
// shared by every tab of this origin, so it is the one channel that can make "active in tab B"
// keep tab A alive, and a lock decided in one tab apply to all of them (each tab runs its own
// `IdleLockManager`, reading the same shared clock).
//
// Every access is wrapped in try/catch: `localStorage` can throw in a private window with storage
// blocked or full, and losing this channel should degrade to "each tab tracks only its own
// activity," never break the console.

const LAST_ACTIVITY_KEY = 'imminow-idle-last-activity'
const SESSION_START_KEY = 'imminow-idle-session-start'

function readNumber(key: string): number | null {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return null
    const value = Number(raw)
    return Number.isFinite(value) ? value : null
  } catch {
    return null
  }
}

function writeNumber(key: string, value: number): void {
  try {
    localStorage.setItem(key, String(value))
  } catch {
    // Private-mode/storage-full/storage-disabled — this tab still tracks its own activity in
    // memory; it just can't share it with other tabs.
  }
}

function clearKey(key: string): void {
  try {
    localStorage.removeItem(key)
  } catch {
    /* nothing to clean up if storage is unavailable */
  }
}

export function readLastActivity(): number | null {
  return readNumber(LAST_ACTIVITY_KEY)
}

export function writeLastActivity(atMs: number): void {
  writeNumber(LAST_ACTIVITY_KEY, atMs)
}

export function readSessionStart(): number | null {
  return readNumber(SESSION_START_KEY)
}

export function writeSessionStart(atMs: number): void {
  writeNumber(SESSION_START_KEY, atMs)
}

/** Called when a session ends, from whichever tab noticed first (idle lock, absolute cap, Log out,
 * or the 401 interceptor) — the next sign-in should start a fresh clock, not inherit a stale one. */
export function clearIdleChannel(): void {
  clearKey(LAST_ACTIVITY_KEY)
  clearKey(SESSION_START_KEY)
}

/** Fires `onChange` when another tab records activity — lets a tab currently showing the 28-minute
 * warning clear it the instant someone moves the mouse in a different tab, rather than waiting for
 * this tab's own next tick (at most `TICK_MS`, but why make it wait at all). Ignores every other
 * storage key, including `imminow-auth` itself. */
export function subscribeToActivityFromOtherTabs(onChange: () => void): () => void {
  const handler = (e: StorageEvent) => {
    if (e.key === LAST_ACTIVITY_KEY) onChange()
  }
  try {
    window.addEventListener('storage', handler)
  } catch {
    return () => {}
  }
  return () => {
    try {
      window.removeEventListener('storage', handler)
    } catch {
      /* nothing to do */
    }
  }
}
