import { useState } from 'react'

// Cursor-stack bookkeeping for Table's Next/Previous controls — the server hands back an opaque
// next_cursor (docs/sentpo_build_reference.md ~1361-1369), so "Previous" can't compute anything;
// it has to remember the cursor it came from. Pages own this (not Table itself) since the cursor
// value is a query param their own fetch hook needs — Table only ever sees hasNext/hasPrevious.
export function useCursorPagination() {
  const [stack, setStack] = useState<string[]>([])
  const [cursor, setCursor] = useState<string | undefined>(undefined)

  function next(nextCursor: string) {
    setStack((s) => [...s, cursor ?? ''])
    setCursor(nextCursor)
  }

  function previous() {
    setStack((s) => {
      if (s.length === 0) return s
      const copy = [...s]
      const prevCursor = copy.pop()
      setCursor(prevCursor || undefined)
      return copy
    })
  }

  // Call whenever sort/filter/search changes — those invalidate the cursor chain.
  function reset() {
    setStack([])
    setCursor(undefined)
  }

  return { cursor, hasPrevious: stack.length > 0, next, previous, reset }
}

// Flattens `useInfiniteQuery` pages from a feed paged NEWEST FIRST (contract gate 7's 2026-09-26
// reorder: `GET /leads/{id}/notes` and `GET /clients/{id}/notes`, `created_at` desc) into a single
// chronological (oldest-first) list, the way a chat thread reads. Each page itself arrives
// newest-first, so both the page order AND each page's own item order have to reverse: the last
// page fetched (oldest notes) goes first, and within it the last item (its oldest note) goes
// first too. Shared so every "load earlier" feed in the console (currently the two notes panels)
// renders and re-renders identically rather than each screen reversing it slightly differently.
export function chronologicalPages<T>(pages: { items: T[] }[] | undefined): T[] {
  if (!pages) return []
  const out: T[] = []
  for (let p = pages.length - 1; p >= 0; p -= 1) {
    const items = pages[p].items
    for (let i = items.length - 1; i >= 0; i -= 1) out.push(items[i])
  }
  return out
}

// Flattens a chat thread's `useInfiniteQuery` pages (lead, client and internal threads: `pages[0]`
// is the newest page, each page oldest-to-newest within itself) into one oldest-first list.
// De-duplicated by id: a message that arrives between two page requests moves the page boundary,
// so the same row can come back at the end of one page and the start of the next, and a converted
// client's `session_break` marker keeps one stable id wherever the boundary falls (review F-029).
export function threadPagesOldestFirst<T extends { id: string }>(pages: { items: T[] }[] | undefined): T[] | undefined {
  if (!pages) return undefined
  const seen = new Set<string>()
  const out: T[] = []
  for (let p = pages.length - 1; p >= 0; p -= 1) {
    for (const item of pages[p].items) {
      if (seen.has(item.id)) continue
      seen.add(item.id)
      out.push(item)
    }
  }
  return out
}

// Walks a paged list to its end and returns every row (contract gate 7). The notes, a case's files
// and its activity were unpaged until then, and their screens still show every row — the paging
// UI for them is later work — so their hooks read all pages, 100 rows a request. Per-record lists,
// so in practice one request; the page cap only stops a server that never ends its cursor.
export async function fetchAllPages<T>(
  fetchPage: (cursor: string | undefined) => Promise<{ items: T[]; meta: { next_cursor?: string | null } }>,
  maxPages = 50,
): Promise<T[]> {
  const rows: T[] = []
  let cursor: string | undefined
  for (let page = 0; page < maxPages; page += 1) {
    const { items, meta } = await fetchPage(cursor)
    rows.push(...items)
    if (!meta.next_cursor) break
    cursor = meta.next_cursor
  }
  return rows
}

/** The `meta` block every cursor-paged list carries (`components['schemas']['PaginatedMeta']`). */
export interface PageMeta {
  next_cursor?: string | null
  total?: number | null
  total_capped?: boolean
}

/**
 * Reads a cursor-paged list's `{ items, meta }` envelope (`GET /applicant-allocation-queue`,
 * `/freelancers`, `/freelancer-rates` since contract gate 12b). `meta.next_cursor` is optional in
 * practice: an envelope with no `meta` (or a missing response) is one complete page — no
 * `next_cursor`, so no pager and no "load more".
 */
export function toPage<T>(raw: { items?: T[] | null; meta?: PageMeta | null } | null | undefined): {
  items: T[]
  meta: PageMeta | undefined
} {
  return { items: raw?.items ?? [], meta: raw?.meta ?? undefined }
}

/**
 * The Table/CursorPager props for one cursor chain, from the page's `meta` and its
 * `useCursorPagination()`. With no `next_cursor` there is nowhere to go forward (and with an
 * empty stack nowhere back), so an unpaged response renders no pager at all.
 */
export function cursorPager(
  paging: { hasPrevious: boolean; next: (cursor: string) => void; previous: () => void },
  meta: PageMeta | null | undefined,
) {
  const nextCursor = meta?.next_cursor
  return {
    hasNext: Boolean(nextCursor),
    hasPrevious: paging.hasPrevious,
    onNext: () => {
      if (nextCursor) paging.next(nextCursor)
    },
    onPrevious: paging.previous,
    total: meta?.total,
    totalCapped: meta?.total_capped,
  }
}
