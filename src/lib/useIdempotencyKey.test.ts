import { act, renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { ApiError } from '@/api/errors'
import { isAlreadyApplied, isClearRefusal, useIdempotencyKey, usePayloadIdempotencyKey } from './useIdempotencyKey'

const refusal = (status: number, code: string) => new ApiError('x', { error: { code, message: 'm' } }, status)

const appliedDetails = { idempotency: 'already_applied', applied_at: '2026-10-06T09:00:00Z' }
const applied = (status: number, code: string, details: Record<string, unknown> | null = appliedDetails) =>
  new ApiError('x', { error: { code, message: 'm', details: details ?? undefined } }, status)

describe('isAlreadyApplied', () => {
  it('is true for a 409 whose details say already_applied, whatever its code', () => {
    expect(isAlreadyApplied(applied(409, 'conflict'))).toBe(true)
    expect(isAlreadyApplied(applied(409, 'request_in_progress'))).toBe(true)
  })

  it('is false for any other answer or error', () => {
    expect(isAlreadyApplied(applied(409, 'conflict', null))).toBe(false)
    expect(isAlreadyApplied(applied(409, 'conflict', { idempotency: 'other' }))).toBe(false)
    expect(isAlreadyApplied(applied(409, 'more_than_owed', {}))).toBe(false)
    expect(isAlreadyApplied(applied(400, 'conflict'))).toBe(false)
    expect(isAlreadyApplied(applied(500, 'conflict'))).toBe(false)
    expect(isAlreadyApplied(refusal(409, 'request_in_progress'))).toBe(false)
    expect(isAlreadyApplied(new TypeError('Failed to fetch'))).toBe(false)
    expect(isAlreadyApplied(undefined)).toBe(false)
  })
})

describe('isClearRefusal', () => {
  it('is true for a 4xx that is not request_in_progress and not already applied', () => {
    expect(isClearRefusal(refusal(409, 'more_than_owed'))).toBe(true)
    expect(isClearRefusal(refusal(422, 'idempotency_key_reused'))).toBe(true)
    expect(isClearRefusal(refusal(429, 'rate_limited'))).toBe(true)
  })

  it('is false for already-applied, request_in_progress, a 5xx and a network failure', () => {
    expect(isClearRefusal(applied(409, 'conflict'))).toBe(false)
    expect(isClearRefusal(applied(409, 'request_in_progress'))).toBe(false)
    expect(isClearRefusal(refusal(409, 'request_in_progress'))).toBe(false)
    expect(isClearRefusal(refusal(500, 'internal_error'))).toBe(false)
    expect(isClearRefusal(new TypeError('Failed to fetch'))).toBe(false)
  })
})

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
    act(() => result.current.settle(applied(409, 'conflict')))
    act(() => result.current.settle(refusal(500, 'internal_error')))
    act(() => result.current.settle(new TypeError('Failed to fetch')))
    act(() => result.current.settle(refusal(409, 'request_in_progress')))
    expect(result.current.key).toBe(first)
  })
})

describe('usePayloadIdempotencyKey', () => {
  const draft = { title: 'Hello', body: 'World', targeting: { stage: 1, study_level: ['UG'] } }

  it('gives every attempt with the same content the same key, across renders', () => {
    const { result, rerender } = renderHook(() => usePayloadIdempotencyKey())
    const first = result.current.keyFor(draft)
    rerender()
    expect(result.current.keyFor({ ...draft })).toBe(first)
    // Same content, fields set in a different order — still the same write.
    expect(
      result.current.keyFor({ targeting: { study_level: ['UG'], stage: 1 }, body: 'World', title: 'Hello' }),
    ).toBe(first)
  })

  it('gives edited content a new key, and does not hand the old one back afterwards', () => {
    const { result } = renderHook(() => usePayloadIdempotencyKey())
    const first = result.current.keyFor(draft)
    const second = result.current.keyFor({ ...draft, body: 'World!' })
    expect(second).not.toBe(first)
    expect(result.current.keyFor(draft)).not.toBe(first)
  })

  it('keeps the key after an unclear failure and renews it after a clear refusal', () => {
    const { result } = renderHook(() => usePayloadIdempotencyKey())
    const first = result.current.keyFor(draft)

    act(() => result.current.settle(new TypeError('Failed to fetch')))
    act(() => result.current.settle(refusal(502, 'bad_gateway')))
    act(() => result.current.settle(refusal(409, 'request_in_progress')))
    act(() => result.current.settle(applied(409, 'conflict')))
    expect(result.current.keyFor(draft)).toBe(first)

    act(() => result.current.settle(refusal(429, 'rate_limited')))
    expect(result.current.keyFor(draft)).not.toBe(first)
  })

  it('renews the key after a 422 idempotency_key_reused', () => {
    const { result } = renderHook(() => usePayloadIdempotencyKey())
    const first = result.current.keyFor(draft)
    act(() => result.current.settle(refusal(422, 'idempotency_key_reused')))
    expect(result.current.keyFor(draft)).not.toBe(first)
  })

  it('each opened form has its own key', () => {
    const a = renderHook(() => usePayloadIdempotencyKey())
    const b = renderHook(() => usePayloadIdempotencyKey())
    expect(a.result.current.keyFor(draft)).not.toBe(b.result.current.keyFor(draft))
  })
})
