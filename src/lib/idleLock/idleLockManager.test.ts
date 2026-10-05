import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ABSOLUTE_CAP_MS, IDLE_LOCK_MS, IDLE_WARNING_MS, IdleLockManager, type IdleLockManagerDeps } from './idleLockManager'
import { useIdleLockStore } from './store'

function makeManager(overrides: Partial<IdleLockManagerDeps> = {}) {
  return new IdleLockManager({
    onLock: vi.fn(),
    refreshSession: vi.fn(async () => {}),
    sessionKey: () => 'session-1',
    ...overrides,
  })
}

describe('IdleLockManager', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    localStorage.clear()
    useIdleLockStore.setState({ warning: false, secondsRemaining: 0 })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('warns at 28 minutes idle with a live countdown to the 30-minute lock', () => {
    const manager = makeManager()
    manager.start()

    vi.advanceTimersByTime(IDLE_WARNING_MS - 1000)
    expect(useIdleLockStore.getState().warning).toBe(false)

    vi.advanceTimersByTime(1000)
    expect(useIdleLockStore.getState().warning).toBe(true)
    expect(useIdleLockStore.getState().secondsRemaining).toBe(120) // 2 minutes to go

    vi.advanceTimersByTime(30_000)
    expect(useIdleLockStore.getState().secondsRemaining).toBe(90)

    manager.stop()
  })

  it('locks at 30 minutes idle and clears the warning', () => {
    const onLock = vi.fn()
    const manager = makeManager({ onLock })
    manager.start()

    vi.advanceTimersByTime(IDLE_LOCK_MS)

    expect(onLock).toHaveBeenCalledTimes(1)
    expect(onLock).toHaveBeenCalledWith('idle')
    expect(useIdleLockStore.getState().warning).toBe(false)
  })

  it('"Stay signed in" refreshes the session, clears the warning at once, and resets the clock', async () => {
    const refreshSession = vi.fn(async () => {})
    const onLock = vi.fn()
    const manager = makeManager({ refreshSession, onLock })
    manager.start()

    vi.advanceTimersByTime(IDLE_WARNING_MS + 30_000)
    expect(useIdleLockStore.getState().warning).toBe(true)

    manager.staySignedIn()

    expect(refreshSession).toHaveBeenCalledTimes(1)
    expect(useIdleLockStore.getState().warning).toBe(false)

    // A fresh 30 minutes from the reset point should not lock.
    vi.advanceTimersByTime(IDLE_LOCK_MS - 1000)
    expect(onLock).not.toHaveBeenCalled()

    // But idling the rest of the way from the reset point does.
    vi.advanceTimersByTime(1000)
    expect(onLock).toHaveBeenCalledTimes(1)
    expect(onLock).toHaveBeenCalledWith('idle')

    manager.stop()
  })

  it('does not count a background/non-tracked event (e.g. polling) as activity', () => {
    const onLock = vi.fn()
    const manager = makeManager({ onLock })
    manager.start()

    document.dispatchEvent(new Event('poll-tick'))
    vi.advanceTimersByTime(IDLE_LOCK_MS)

    expect(onLock).toHaveBeenCalledTimes(1)
    expect(onLock).toHaveBeenCalledWith('idle')
  })

  it('a tracked activity event (keydown) resets the idle clock', () => {
    const onLock = vi.fn()
    const manager = makeManager({ onLock })
    manager.start()

    vi.advanceTimersByTime(IDLE_WARNING_MS + 30_000)
    expect(useIdleLockStore.getState().warning).toBe(true)

    document.dispatchEvent(new KeyboardEvent('keydown'))
    expect(useIdleLockStore.getState().warning).toBe(false)

    vi.advanceTimersByTime(IDLE_LOCK_MS - 1000)
    expect(onLock).not.toHaveBeenCalled()

    manager.stop()
  })

  it('activity recorded by another tab (localStorage write + storage event) resets this tab too', () => {
    const manager = makeManager()
    manager.start()

    vi.advanceTimersByTime(IDLE_WARNING_MS + 30_000)
    expect(useIdleLockStore.getState().warning).toBe(true)

    const otherTabNow = Date.now()
    localStorage.setItem('imminow-idle-last-activity:session-1', String(otherTabNow))
    window.dispatchEvent(
      new StorageEvent('storage', { key: 'imminow-idle-last-activity:session-1', newValue: String(otherTabNow) }),
    )

    expect(useIdleLockStore.getState().warning).toBe(false)

    manager.stop()
  })

  it('two tabs sharing the same clock lock together', () => {
    const onLockA = vi.fn()
    const onLockB = vi.fn()
    const managerA = makeManager({ onLock: onLockA })
    const managerB = makeManager({ onLock: onLockB })
    managerA.start()
    managerB.start()

    vi.advanceTimersByTime(IDLE_LOCK_MS)

    expect(onLockA).toHaveBeenCalledTimes(1)
    expect(onLockA).toHaveBeenCalledWith('idle')
    expect(onLockB).toHaveBeenCalledTimes(1)
    expect(onLockB).toHaveBeenCalledWith('idle')
  })

  it('locks at 12 hours even with continuous activity resetting the idle clock', () => {
    const onLock = vi.fn()
    const manager = makeManager({ onLock })
    manager.start()

    for (let elapsed = 0; elapsed < ABSOLUTE_CAP_MS; elapsed += 5 * 60 * 1000) {
      document.dispatchEvent(new KeyboardEvent('keydown'))
      vi.advanceTimersByTime(5 * 60 * 1000)
    }

    expect(onLock).toHaveBeenCalledTimes(1)
    expect(onLock).toHaveBeenCalledWith('absolute')
  })

  describe('values left in storage by an earlier session', () => {
    const HOUR = 60 * 60 * 1000

    it('a new sign-in is not locked by the previous session\'s stale clock', () => {
      // Yesterday's session ended by closing the tab — nothing cleared its clock.
      const yesterday = Date.now() - 20 * HOUR
      localStorage.setItem('imminow-idle-session-start:session-old', String(yesterday))
      localStorage.setItem('imminow-idle-last-activity:session-old', String(yesterday + HOUR))
      // And the un-scoped keys a build from before this fix would have left.
      localStorage.setItem('imminow-idle-session-start', String(yesterday))
      localStorage.setItem('imminow-idle-last-activity', String(yesterday + HOUR))

      const onLock = vi.fn()
      const manager = makeManager({ onLock, sessionKey: () => 'session-new' })
      manager.start({ fresh: true })

      vi.advanceTimersByTime(IDLE_WARNING_MS - 1000)
      expect(onLock).not.toHaveBeenCalled()
      expect(useIdleLockStore.getState().warning).toBe(false)

      // The dead session's entries (and the legacy ones) were tidied away on the way in.
      expect(Object.keys(localStorage).sort()).toEqual([
        'imminow-idle-last-activity:session-new',
        'imminow-idle-session-start:session-new',
      ])

      manager.stop()
    })

    it('a sign-in always starts a fresh clock, even over values stored under its own key', () => {
      const yesterday = Date.now() - 20 * HOUR
      localStorage.setItem('imminow-idle-session-start:session-1', String(yesterday))
      localStorage.setItem('imminow-idle-last-activity:session-1', String(yesterday))

      const onLock = vi.fn()
      const manager = makeManager({ onLock })
      manager.start({ fresh: true })

      vi.advanceTimersByTime(60_000)
      expect(onLock).not.toHaveBeenCalled()
      expect(localStorage.getItem('imminow-idle-session-start:session-1')).toBe(String(Date.now() - 60_000))

      manager.stop()
    })

    it('a session with no usable key (not the v1 token form) keeps its clock in memory only', () => {
      localStorage.setItem('imminow-idle-session-start', String(Date.now() - 20 * HOUR))
      const onLock = vi.fn()
      const manager = makeManager({ onLock, sessionKey: () => null })
      manager.start({ fresh: true })

      vi.advanceTimersByTime(IDLE_LOCK_MS - 1000)
      expect(onLock).not.toHaveBeenCalled()
      vi.advanceTimersByTime(1000)
      expect(onLock).toHaveBeenCalledWith('idle')
      expect(localStorage.length).toBe(0)
    })
  })

  describe('several tabs', () => {
    it('a tab joining the same session mid-way (reload, duplicated tab) adopts the shared clock', () => {
      const onLockA = vi.fn()
      const onLockB = vi.fn()
      const managerA = makeManager({ onLock: onLockA })
      managerA.start({ fresh: true })

      vi.advanceTimersByTime(20 * 60 * 1000)
      const managerB = makeManager({ onLock: onLockB })
      managerB.start() // not a sign-in: same session, already 20 minutes idle

      vi.advanceTimersByTime(10 * 60 * 1000 - 1000)
      expect(onLockB).not.toHaveBeenCalled()
      vi.advanceTimersByTime(1000)
      expect(onLockA).toHaveBeenCalledWith('idle')
      expect(onLockB).toHaveBeenCalledWith('idle') // 30 minutes from the SHARED last activity, not from B's start
    })

    it('activity in one tab of a session keeps the other tab of that session alive', () => {
      const onLockA = vi.fn()
      const onLockB = vi.fn()
      const managerA = makeManager({ onLock: onLockA })
      const managerB = makeManager({ onLock: onLockB })
      managerA.start({ fresh: true })
      managerB.start()

      vi.advanceTimersByTime(IDLE_WARNING_MS + 30_000)
      managerA.staySignedIn() // written to the shared clock at once
      vi.advanceTimersByTime(5 * 60 * 1000)

      expect(onLockA).not.toHaveBeenCalled()
      expect(onLockB).not.toHaveBeenCalled()
      expect(useIdleLockStore.getState().warning).toBe(false)

      managerA.stop()
      managerB.stop()
    })

    it('a tab signed in to a DIFFERENT session neither shares nor disturbs this one\'s clock', () => {
      const onLockA = vi.fn()
      const onLockB = vi.fn()
      const managerA = makeManager({ onLock: onLockA, sessionKey: () => 'session-a' })
      managerA.start({ fresh: true })

      vi.advanceTimersByTime(20 * 60 * 1000)
      const managerB = makeManager({ onLock: onLockB, sessionKey: () => 'session-b' })
      managerB.start({ fresh: true })

      vi.advanceTimersByTime(10 * 60 * 1000)
      expect(onLockA).toHaveBeenCalledWith('idle') // A's own 30 minutes, untouched by B signing in
      expect(onLockB).not.toHaveBeenCalled()
      // A ending did not take B's clock with it.
      expect(localStorage.getItem('imminow-idle-session-start:session-b')).not.toBeNull()

      managerB.stop()
    })

    it('still applies the 12-hour cap after another tab of the session cleared the shared clock', () => {
      const onLockA = vi.fn()
      const managerA = makeManager({ onLock: onLockA })
      const managerB = makeManager()
      managerA.start({ fresh: true })
      managerB.start()

      managerB.stop() // signed out in tab B — removes the session's shared entries

      for (let elapsed = 0; elapsed < ABSOLUTE_CAP_MS; elapsed += 5 * 60 * 1000) {
        document.dispatchEvent(new KeyboardEvent('keydown'))
        vi.advanceTimersByTime(5 * 60 * 1000)
      }

      expect(onLockA).toHaveBeenCalledTimes(1)
      expect(onLockA).toHaveBeenCalledWith('absolute')
    })
  })

  it('a reload into a session that really has been idle past 30 minutes still locks', () => {
    // Same session (e.g. a restored tab): the stored clock is this session's own and is honoured.
    const now = Date.now()
    localStorage.setItem('imminow-idle-session-start:session-1', String(now - 2 * 60 * 60 * 1000))
    localStorage.setItem('imminow-idle-last-activity:session-1', String(now - 31 * 60 * 1000))

    const onLock = vi.fn()
    const manager = makeManager({ onLock })
    manager.start()

    vi.advanceTimersByTime(1000)
    expect(onLock).toHaveBeenCalledTimes(1)
    expect(onLock).toHaveBeenCalledWith('idle')
  })
})
