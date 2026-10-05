import { useEffect, useMemo } from 'react'
import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/api/client'
import { useRealtimeOpen } from '@/lib/realtime'
import { mergeNewestMessages, threadMessagesKey } from '@/lib/realtime/queryCache'
import { threadPagesOldestFirst } from '@/lib/pagination'
import { useAuthStore } from '@/stores/authStore'
import { ApiError } from './auth'

const PAGE_SIZE = 30
const POLL_MS = 5000

async function fetchThreadPage(type: 'lead' | 'client', id: string, before: string | undefined) {
  const query = { limit: PAGE_SIZE, before }
  const { data, error } =
    type === 'lead'
      ? await api.GET('/leads/{id}/messages', { params: { path: { id }, query } })
      : await api.GET('/clients/{id}/messages', { params: { path: { id }, query } })
  if (error) throw new ApiError('Could not load messages.', error)
  return data
}

/**
 * A lead's or a client's chat thread, paged from the newest end (review F-029) exactly as
 * `useInternalConversationMessages` pages an internal one. The first page is the newest
 * `PAGE_SIZE` messages; `meta.next_cursor` goes back UNTOUCHED as `before` for the page older
 * than it — it is an encoded position, not a message id. For a converted client the server walks
 * the case thread, the `session_break` marker and then the origin lead's thread under that one
 * cursor, so the earlier conversation simply arrives as "Load earlier" reaches it.
 *
 * `items` is every loaded page as one oldest-first list. Both hooks used to send no `limit` or
 * `before` and ignore the cursor, so a thread showed its newest 20 messages and nothing said more
 * existed.
 *
 * Polls every 5s as a fallback only — while the realtime socket is open, `chat.message` /
 * `chat.delivered` / `chat.read` frames patch this same cache directly (contract gate 8, Wave 3
 * plan §6.6) and the poll switches itself off; it resumes the instant the socket isn't open
 * (reconnecting, disabled against the mock, or an outage). With one page loaded that poll is the
 * query's own refetch, as before. Once older pages are loaded a refetch would ask for every one
 * of them, so the poll asks for the newest page only and folds it in (`mergeNewestMessages`).
 */
export function useThreadMessages(type: 'lead' | 'client', id: string | undefined) {
  const isAuthed = useAuthStore((s) => Boolean(s.accessToken))
  const realtimeOpen = useRealtimeOpen()
  const queryClient = useQueryClient()
  const enabled = isAuthed && Boolean(id)
  const query = useInfiniteQuery({
    queryKey: threadMessagesKey({ type, id: id ?? '' }),
    queryFn: ({ pageParam }: { pageParam: string | undefined }) => fetchThreadPage(type, id!, pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.meta.next_cursor ?? undefined,
    enabled,
    refetchInterval: (q) => (realtimeOpen || (q.state.data?.pages.length ?? 0) > 1 ? false : POLL_MS),
  })

  const pagesLoaded = query.data?.pages.length ?? 0
  const pollNewestOnly = enabled && !realtimeOpen && pagesLoaded > 1
  useEffect(() => {
    if (!pollNewestOnly || !id) return
    const timer = setInterval(() => {
      fetchThreadPage(type, id, undefined)
        .then((page) => mergeNewestMessages(queryClient, { type, id }, page.items))
        // A failed poll is simply tried again five seconds later; what is on screen stays.
        .catch(() => {})
    }, POLL_MS)
    return () => clearInterval(timer)
  }, [pollNewestOnly, type, id, queryClient])

  const items = useMemo(() => threadPagesOldestFirst(query.data?.pages), [query.data])
  const { hasNextPage, isFetchingNextPage, fetchNextPage } = query
  return {
    items,
    isLoading: query.isLoading,
    isError: query.isError,
    refetch: query.refetch,
    /** Older messages exist on the server (for a converted client, the lead conversation too). */
    hasEarlier: hasNextPage,
    loadingEarlier: isFetchingNextPage,
    loadEarlier: () => {
      if (hasNextPage && !isFetchingNextPage) void fetchNextPage()
    },
  }
}
