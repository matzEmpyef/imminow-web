import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ABSOLUTE_CAP_MS, IDLE_LOCK_MS, IDLE_WARNING_MS, IdleLockManager, type IdleLockManagerDeps } from './idleLockManager'
import { useIdleLockStore } from './store'

function makeManager(overrides: Partial<IdleLockManagerDeps> = {}) {
  return new IdleLockManager({
    onLock: vi.fn(),
    refreshSession: vi.fn(async () => {}),
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
    localStorage.setItem('imminow-idle-last-activity', String(otherTabNow))
    window.dispatchEvent(
      new StorageEvent('storage', { key: 'imminow-idle-last-activity', newValue: String(otherTabNow) }),
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
})
