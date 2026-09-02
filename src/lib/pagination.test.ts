import { act, renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { useCursorPagination } from './pagination'

// Table's Previous button can only work if this hook remembers the cursor each page was reached
// FROM — the server's cursor is opaque and one-directional. These pin the stack discipline.
describe('useCursorPagination', () => {
  it('starts on the first page with nothing to go back to', () => {
    const { result } = renderHook(() => useCursorPagination())
    expect(result.current.cursor).toBeUndefined()
    expect(result.current.hasPrevious).toBe(false)
  })

  it('next() advances and remembers where it came from; previous() walks back the same path', () => {
    const { result } = renderHook(() => useCursorPagination())

    act(() => result.current.next('c2'))
    expect(result.current.cursor).toBe('c2')
    expect(result.current.hasPrevious).toBe(true)

    act(() => result.current.next('c3'))
    expect(result.current.cursor).toBe('c3')

    act(() => result.current.previous())
    expect(result.current.cursor).toBe('c2')

    act(() => result.current.previous())
    // Back on the first page: the cursor is undefined again (the '' sentinel never leaks out).
    expect(result.current.cursor).toBeUndefined()
    expect(result.current.hasPrevious).toBe(false)
  })

  it('previous() on the first page is a no-op', () => {
    const { result } = renderHook(() => useCursorPagination())
    act(() => result.current.previous())
    expect(result.current.cursor).toBeUndefined()
    expect(result.current.hasPrevious).toBe(false)
  })

  it('reset() throws the whole chain away — a changed sort or filter invalidates every cursor', () => {
    const { result } = renderHook(() => useCursorPagination())
    act(() => result.current.next('c2'))
    act(() => result.current.next('c3'))
    act(() => result.current.reset())
    expect(result.current.cursor).toBeUndefined()
    expect(result.current.hasPrevious).toBe(false)
  })
})
