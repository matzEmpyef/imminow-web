import { act, renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { chronologicalPages, cursorPager, fetchAllPages, toPage, useCursorPagination } from './pagination'

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

// GET /leads/{id}/notes and GET /clients/{id}/notes page newest-first since the 2026-09-26
// coordinator reorder (contract gate 7). `useInfiniteQuery` fetches pages in that order — the
// first-fetched page (`pages[0]`) is the newest 20, the next fetched page (older) goes after it —
// but the notes panels render chronologically (oldest at top), so both the page order and each
// page's own item order have to flip.
describe('chronologicalPages', () => {
  it('reverses page order and each page\'s item order to read oldest-first overall', () => {
    // Page 1 (fetched first, newest): notes 6..4 in the order the server sent them (newest first).
    // Page 2 (fetched second via next_cursor, older): notes 3..1, same server order.
    const pages = [
      { items: [{ id: 6 }, { id: 5 }, { id: 4 }] },
      { items: [{ id: 3 }, { id: 2 }, { id: 1 }] },
    ]
    expect(chronologicalPages(pages).map((n) => n.id)).toEqual([1, 2, 3, 4, 5, 6])
  })

  it('one page still reverses to oldest-first', () => {
    const pages = [{ items: [{ id: 3 }, { id: 2 }, { id: 1 }] }]
    expect(chronologicalPages(pages).map((n) => n.id)).toEqual([1, 2, 3])
  })

  it('handles no pages loaded yet', () => {
    expect(chronologicalPages(undefined)).toEqual([])
    expect(chronologicalPages([])).toEqual([])
  })
})

// Contract gate 12: three lists (allocation queue, freelancers, freelancer rates) gain cursor
// paging while the frozen mock still answers with the plain array. toPage reads either shape and
// cursorPager turns the meta into Table/CursorPager props — no next_cursor, no pager.
describe('toPage', () => {
  it('treats a plain array as one complete, unpaged page', () => {
    expect(toPage([1, 2])).toEqual({ items: [1, 2], meta: undefined })
  })

  it('reads the cursor envelope', () => {
    expect(toPage({ items: ['a'], meta: { next_cursor: 'c2', total: 9 } })).toEqual({
      items: ['a'],
      meta: { next_cursor: 'c2', total: 9 },
    })
  })

  it('survives an envelope with no meta and a missing response', () => {
    expect(toPage({ items: ['a'] })).toEqual({ items: ['a'], meta: undefined })
    expect(toPage(undefined)).toEqual({ items: [], meta: undefined })
  })
})

describe('cursorPager', () => {
  it('shows no way forward or back for an unpaged response', () => {
    const { result } = renderHook(() => useCursorPagination())
    const pager = cursorPager(result.current, undefined)
    expect(pager.hasNext).toBe(false)
    expect(pager.hasPrevious).toBe(false)
  })

  it('walks forward on the server cursor and back on the remembered one', () => {
    const { result, rerender } = renderHook(
      ({ meta }: { meta: { next_cursor: string | null; total?: number } }) => {
        const paging = useCursorPagination()
        return { paging, pager: cursorPager(paging, meta) }
      },
      { initialProps: { meta: { next_cursor: 'c2', total: 41 } as { next_cursor: string | null; total?: number } } },
    )
    expect(result.current.pager.hasNext).toBe(true)
    expect(result.current.pager.total).toBe(41)

    act(() => result.current.pager.onNext())
    expect(result.current.paging.cursor).toBe('c2')

    rerender({ meta: { next_cursor: null } })
    expect(result.current.pager.hasNext).toBe(false)
    expect(result.current.pager.hasPrevious).toBe(true)
    act(() => result.current.pager.onNext())
    expect(result.current.paging.cursor).toBe('c2')

    act(() => result.current.pager.onPrevious())
    expect(result.current.paging.cursor).toBeUndefined()
  })
})
