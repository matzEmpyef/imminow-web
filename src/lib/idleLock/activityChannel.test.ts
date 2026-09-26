import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  clearIdleChannel,
  readLastActivity,
  readSessionStart,
  subscribeToActivityFromOtherTabs,
  writeLastActivity,
  writeSessionStart,
} from './activityChannel'

describe('idleLock activityChannel', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('round-trips the last-activity and session-start timestamps through localStorage', () => {
    expect(readLastActivity()).toBeNull()
    expect(readSessionStart()).toBeNull()

    writeLastActivity(1000)
    writeSessionStart(500)

    expect(readLastActivity()).toBe(1000)
    expect(readSessionStart()).toBe(500)
  })

  it('clearIdleChannel removes both keys', () => {
    writeLastActivity(1000)
    writeSessionStart(500)

    clearIdleChannel()

    expect(readLastActivity()).toBeNull()
    expect(readSessionStart()).toBeNull()
  })

  it('ignores a malformed stored value rather than throwing', () => {
    localStorage.setItem('imminow-idle-last-activity', 'not-a-number')
    expect(readLastActivity()).toBeNull()
  })

  it('subscribeToActivityFromOtherTabs only fires for its own key', () => {
    const onChange = vi.fn()
    const unsubscribe = subscribeToActivityFromOtherTabs(onChange)

    window.dispatchEvent(new StorageEvent('storage', { key: 'imminow-auth', newValue: '{}' }))
    expect(onChange).not.toHaveBeenCalled()

    window.dispatchEvent(new StorageEvent('storage', { key: 'imminow-idle-last-activity', newValue: '123' }))
    expect(onChange).toHaveBeenCalledTimes(1)

    unsubscribe()
    window.dispatchEvent(new StorageEvent('storage', { key: 'imminow-idle-last-activity', newValue: '456' }))
    expect(onChange).toHaveBeenCalledTimes(1)
  })
})
