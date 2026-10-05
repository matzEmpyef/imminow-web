import { useMemo } from 'react'
import { useInfiniteQuery } from '@tanstack/react-query'
import { useAuthStore } from '@/stores/authStore'
import type { SearchSelectOption } from '@/components/SearchSelect'

/**
 * Where a server-searched picker gets its rows (review F-038). One per list — see
 * `queries/pickerSources.ts` — so every picker over the same list asks the same way.
 */
export interface ServerSearchSource<T> {
  /** Identifies the list and every fixed filter on it; the typed term is appended to it. */
  queryKey: readonly unknown[]
  /** One page for `search` ('' is the list's own first page). `nextCursor` goes back untouched. */
  fetchPage: (args: {
    search: string
    cursor: string | undefined
    signal: AbortSignal
  }) => Promise<{ items: T[]; nextCursor?: string | null }>
  /** One row by id, for showing a saved value that is not in the loaded results. */
  fetchById?: (id: string, signal: AbortSignal) => Promise<T | null>
  toOption: (row: T) => SearchSelectOption
}

/**
 * The data half of the picker, usable without its dropdown (a checklist, a chip field): rows for
 * `term` from the server, paged by the list's cursor. The term is part of the query key, so the
 * answer to an earlier term can never be shown for a later one, and the request for a term nobody
 * is waiting on any more is aborted through the `signal`.
 */
export function useServerSearch<T>(source: ServerSearchSource<T>, term: string, enabled = true) {
  const isAuthed = useAuthStore((s) => Boolean(s.accessToken))
  const search = term.trim()
  const query = useInfiniteQuery({
    queryKey: [...source.queryKey, 'search', search],
    queryFn: ({ pageParam, signal }) => source.fetchPage({ search, cursor: pageParam, signal }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    enabled: isAuthed && enabled,
    staleTime: 30 * 1000,
  })
  const { toOption } = source
  // A cursor page can repeat a row when the list shifted between two requests; one entry per id.
  const entries = useMemo(() => {
    const seen = new Set<string>()
    const out: { row: T; option: SearchSelectOption }[] = []
    for (const page of query.data?.pages ?? []) {
      for (const row of page.items) {
        const option = toOption(row)
        if (seen.has(option.id)) continue
        seen.add(option.id)
        out.push({ row, option })
      }
    }
    return out
    // `toOption` is a pure mapping the caller re-creates each render; the pages are what change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query.data])

  const { hasNextPage, isFetchingNextPage, fetchNextPage } = query
  return {
    entries,
    isLoading: query.isPending && query.fetchStatus !== 'idle',
    isError: query.isError,
    hasMore: Boolean(hasNextPage),
    isLoadingMore: isFetchingNextPage,
    loadMore: () => {
      if (hasNextPage && !isFetchingNextPage) void fetchNextPage()
    },
    retry: () => void query.refetch(),
  }
}
