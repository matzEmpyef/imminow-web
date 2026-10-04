import { act, renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { ApiError } from '@/api/errors'
import { useIdempotencyKey } from './useIdempotencyKey'

const refusal = (status: number, code: string) => new ApiError('x', { error: { code, message: 'm' } }, status)

describe('useIdempotencyKey', () => {
  it('keeps one key while the form is open', () => {
    const { result, rerender } = renderHook(() => useIdempotencyKey())
    const first = result.current.key
    rerender()
    expect(result.current.key).toBe(first)
  })

  it('mints a fresh key after a refused (4xx) write, so a corrected retry is a new write', () => {
    const { result } = renderHook(() => useIdempotencyKey())
    const first = result.current.key
    act(() => result.current.settle(refusal(409, 'more_than_owed')))
    expect(result.current.key).not.toBe(first)
  })

  it('keeps the key after a 5xx, a network failure, or a request still in progress', () => {
    const { result } = renderHook(() => useIdempotencyKey())
    const first = result.current.key
    act(() => result.current.settle(refusal(500, 'internal_error')))
    act(() => result.current.settle(new TypeError('Failed to fetch')))
    act(() => result.current.settle(refusal(409, 'request_in_progress')))
    expect(result.current.key).toBe(first)
  })
})
