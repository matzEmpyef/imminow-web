import { act, renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { fetchAllPages, useCursorPagination } from './pagination'

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

// The hooks for the lists contract gate 7 paged still hand their screens every row.
describe('fetchAllPages', () => {
  it('follows next_cursor to the end and keeps the order', async () => {
    const pages: Record<string, { items: number[]; meta: { next_cursor: string | null } }> = {
      first: { items: [1, 2], meta: { next_cursor: 'b' } },
      b: { items: [3], meta: { next_cursor: 'c' } },
      c: { items: [4, 5], meta: { next_cursor: null } },
    }
    const asked: (string | undefined)[] = []
    const rows = await fetchAllPages(async (cursor) => {
      asked.push(cursor)
      return pages[cursor ?? 'first']
    })
    expect(rows).toEqual([1, 2, 3, 4, 5])
    expect(asked).toEqual([undefined, 'b', 'c'])
  })

  it('stops at the page cap if a cursor never ends', async () => {
    let calls = 0
    const rows = await fetchAllPages(async () => {
      calls += 1
      return { items: [calls], meta: { next_cursor: 'again' } }
    }, 3)
    expect(rows).toEqual([1, 2, 3])
  })
})
