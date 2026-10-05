// Cross-tab activity + session-start timestamps for the console's idle lock (PROGRESS.md
// Pre-Production Checklist "Idle auto-lock"; TRD Section 9 / REVIEW_TRIAGE item 24 — console
// sessions only). `authStore` persists to sessionStorage, which is per-tab; `localStorage` is
// shared by every tab of this origin, so it is the one channel that can make "active in tab B"
// keep tab A alive, and a lock decided in one tab apply to all of them (each tab runs its own
// `IdleLockManager`, reading the same shared clock).
//
// Both timestamps are stored PER SESSION (the key carries the session's own key, see
// `sessionKeyFromRefreshToken`): closing the tab or the browser never runs a sign-out, so whatever
// one session left behind must not be read as the next session's clock — that ended every returning
// user's first sign-in a second later with "signed out for security". Tabs that share a session (a
// duplicated tab) still share one clock; tabs signed in separately each keep their own, matching
// the server, which tracks idle time per session too. A `null` session key (a refresh token that
// isn't in the `v1.<session id>.<token>` form) means nothing is shared and nothing is stored.
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

function scoped(key: string, sessionKey: string): string {
  return `${key}:${sessionKey}`
}

/** The stable per-session part of the console's refresh token, `v1.<session id>.<token>` — an
 * identifier, not a secret (the secret is the third part), and unchanged when the token rotates.
 * `null` for anything not in that form. */
export function sessionKeyFromRefreshToken(refreshToken: string | null): string | null {
  if (!refreshToken) return null
  const [version, sessionId, ...rest] = refreshToken.split('.')
  if (version !== 'v1' || !sessionId || rest.length === 0) return null
  return sessionId
}

export function readLastActivity(sessionKey: string | null): number | null {
  return sessionKey ? readNumber(scoped(LAST_ACTIVITY_KEY, sessionKey)) : null
}

export function writeLastActivity(sessionKey: string | null, atMs: number): void {
  if (sessionKey) writeNumber(scoped(LAST_ACTIVITY_KEY, sessionKey), atMs)
}

export function readSessionStart(sessionKey: string | null): number | null {
  return sessionKey ? readNumber(scoped(SESSION_START_KEY, sessionKey)) : null
}

export function writeSessionStart(sessionKey: string | null, atMs: number): void {
  if (sessionKey) writeNumber(scoped(SESSION_START_KEY, sessionKey), atMs)
}

/** Called when a session ends, from whichever tab noticed first (idle lock, absolute cap, Log out,
 * or the 401 interceptor). Removes that session's clock only — another session signed in in a
 * different tab keeps its own. */
export function clearIdleChannel(sessionKey: string | null): void {
  if (!sessionKey) return
  clearKey(scoped(LAST_ACTIVITY_KEY, sessionKey))
  clearKey(scoped(SESSION_START_KEY, sessionKey))
}

/** Housekeeping at sign-in/reload: a session that ended by closing the tab leaves its two entries
 * behind for good. Removes every OTHER session's clock that started `maxAgeMs` or more ago (or has
 * no readable start) — such a session is past the absolute cap, so no live tab can still be using
 * it — plus the un-scoped keys older builds wrote. */
export function pruneStaleIdleClocks(currentSessionKey: string | null, nowMs: number, maxAgeMs: number): void {
  try {
    const found = new Set<string>()
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)
      if (!key) continue
      for (const base of [LAST_ACTIVITY_KEY, SESSION_START_KEY]) {
        if (key === base) found.add('')
        else if (key.startsWith(`${base}:`)) found.add(key.slice(base.length + 1))
      }
    }
    for (const sessionKey of found) {
      if (sessionKey === '') {
        clearKey(LAST_ACTIVITY_KEY)
        clearKey(SESSION_START_KEY)
        continue
      }
      if (sessionKey === currentSessionKey) continue
      const start = readSessionStart(sessionKey)
      if (start == null || nowMs - start >= maxAgeMs) clearIdleChannel(sessionKey)
    }
  } catch {
    /* storage unavailable — nothing to tidy */
  }
}

/** Fires `onChange` when another tab records activity — lets a tab currently showing the 28-minute
 * warning clear it the instant someone moves the mouse in a different tab, rather than waiting for
 * this tab's own next tick (at most `TICK_MS`, but why make it wait at all). Ignores every other
 * storage key, including `imminow-auth` itself and other sessions' clocks. */
export function subscribeToActivityFromOtherTabs(sessionKey: string | null, onChange: () => void): () => void {
  if (!sessionKey) return () => {}
  const ownKey = scoped(LAST_ACTIVITY_KEY, sessionKey)
  const handler = (e: StorageEvent) => {
    if (e.key === ownKey) onChange()
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
