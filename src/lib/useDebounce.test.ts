import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useDebouncedValue } from './useDebounce'

// The one debounce behind Table search and GlobalSearch. A regression here either fires a request
// per keystroke or never fires at all — both invisible in a type check.
describe('useDebouncedValue', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('returns the initial value immediately and the latest value only after the delay', () => {
    const { result, rerender } = renderHook(({ value }) => useDebouncedValue(value, 300), {
      initialProps: { value: 'a' },
    })
    expect(result.current).toBe('a')

    rerender({ value: 'ab' })
    act(() => void vi.advanceTimersByTime(299))
    expect(result.current).toBe('a')

    act(() => void vi.advanceTimersByTime(1))
    expect(result.current).toBe('ab')
  })

  it('restarts the timer on every change so only the last value in a burst lands', () => {
    const { result, rerender } = renderHook(({ value }) => useDebouncedValue(value, 300), {
      initialProps: { value: '' },
    })
    for (const typed of ['r', 'ra', 'raj']) {
      rerender({ value: typed })
      act(() => void vi.advanceTimersByTime(200))
    }
    expect(result.current).toBe('')
    act(() => void vi.advanceTimersByTime(300))
    expect(result.current).toBe('raj')
  })

  it('defaults to 300ms', () => {
    const { result, rerender } = renderHook(({ value }) => useDebouncedValue(value), { initialProps: { value: 1 } })
    rerender({ value: 2 })
    act(() => void vi.advanceTimersByTime(299))
    expect(result.current).toBe(1)
    act(() => void vi.advanceTimersByTime(1))
    expect(result.current).toBe(2)
  })
})
