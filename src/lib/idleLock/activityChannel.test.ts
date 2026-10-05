import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  clearIdleChannel,
  pruneStaleIdleClocks,
  readLastActivity,
  readSessionStart,
  sessionKeyFromRefreshToken,
  subscribeToActivityFromOtherTabs,
  writeLastActivity,
  writeSessionStart,
} from './activityChannel'

describe('idleLock activityChannel', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('round-trips the last-activity and session-start timestamps through localStorage', () => {
    expect(readLastActivity('s1')).toBeNull()
    expect(readSessionStart('s1')).toBeNull()

    writeLastActivity('s1', 1000)
    writeSessionStart('s1', 500)

    expect(readLastActivity('s1')).toBe(1000)
    expect(readSessionStart('s1')).toBe(500)
  })

  it('keeps each session\'s clock apart', () => {
    writeLastActivity('s1', 1000)
    writeSessionStart('s1', 500)

    expect(readLastActivity('s2')).toBeNull()
    expect(readSessionStart('s2')).toBeNull()
  })

  it('stores and reads nothing without a session key', () => {
    writeLastActivity(null, 1000)
    writeSessionStart(null, 500)

    expect(localStorage.length).toBe(0)
    expect(readLastActivity(null)).toBeNull()
    expect(readSessionStart(null)).toBeNull()
  })

  it('clearIdleChannel removes both keys of that session only', () => {
    writeLastActivity('s1', 1000)
    writeSessionStart('s1', 500)
    writeLastActivity('s2', 2000)

    clearIdleChannel('s1')

    expect(readLastActivity('s1')).toBeNull()
    expect(readSessionStart('s1')).toBeNull()
    expect(readLastActivity('s2')).toBe(2000)
  })

  it('ignores a malformed stored value rather than throwing', () => {
    localStorage.setItem('imminow-idle-last-activity:s1', 'not-a-number')
    expect(readLastActivity('s1')).toBeNull()
  })

  it('subscribeToActivityFromOtherTabs only fires for its own session\'s key', () => {
    const onChange = vi.fn()
    const unsubscribe = subscribeToActivityFromOtherTabs('s1', onChange)

    window.dispatchEvent(new StorageEvent('storage', { key: 'imminow-auth', newValue: '{}' }))
    window.dispatchEvent(new StorageEvent('storage', { key: 'imminow-idle-last-activity:s2', newValue: '1' }))
    expect(onChange).not.toHaveBeenCalled()

    window.dispatchEvent(new StorageEvent('storage', { key: 'imminow-idle-last-activity:s1', newValue: '123' }))
    expect(onChange).toHaveBeenCalledTimes(1)

    unsubscribe()
    window.dispatchEvent(new StorageEvent('storage', { key: 'imminow-idle-last-activity:s1', newValue: '456' }))
    expect(onChange).toHaveBeenCalledTimes(1)
  })

  it('sessionKeyFromRefreshToken takes the session id out of `v1.<session id>.<token>`', () => {
    expect(sessionKeyFromRefreshToken('v1.0b9f6c1e-aaaa-bbbb-cccc-1234567890ab.opaque.idp.token')).toBe(
      '0b9f6c1e-aaaa-bbbb-cccc-1234567890ab',
    )
    expect(sessionKeyFromRefreshToken('r1')).toBeNull()
    expect(sessionKeyFromRefreshToken('v2.abc.def')).toBeNull()
    expect(sessionKeyFromRefreshToken('v1.abc')).toBeNull()
    expect(sessionKeyFromRefreshToken(null)).toBeNull()
  })

  it('pruneStaleIdleClocks drops dead sessions and legacy keys, keeps live ones and unrelated keys', () => {
    const HOUR = 60 * 60 * 1000
    const now = 100 * HOUR
    localStorage.setItem('imminow-idle-last-activity', '1') // legacy, un-scoped
    localStorage.setItem('imminow-idle-session-start', '1')
    writeSessionStart('dead', now - 13 * HOUR)
    writeLastActivity('dead', now - 13 * HOUR)
    writeLastActivity('orphan', now) // no start to judge it by
    writeSessionStart('live', now - HOUR)
    writeLastActivity('live', now - 60_000)
    writeSessionStart('mine', now - 13 * HOUR) // never pruned by its own session
    localStorage.setItem('unrelated', 'x')

    pruneStaleIdleClocks('mine', now, 12 * HOUR)

    expect(Object.keys(localStorage).sort()).toEqual([
      'imminow-idle-last-activity:live',
      'imminow-idle-session-start:live',
      'imminow-idle-session-start:mine',
      'unrelated',
    ])
  })
})
