import { useInfiniteQuery, useQuery } from '@tanstack/react-query'
import { api } from '@/api/client'
import { useRealtimeOpen } from '@/lib/realtime'
import { useAuthStore } from '@/stores/authStore'
import { ApiError } from './auth'

// Global Chat Drawer feed — every lead + client conversation merged newest-first, plus (Ultimate
// tier) the same colleague-DM/Team rows Internal Messaging lists. Removed 2026-08-19 on a
// misread instruction and restored 2026-08-20 (user: "I want it. I don't think I asked you to
// remove it, I asked to not do a tab feature for Aspirants and Applicants") — hence one merged
// list, deliberately never split into Aspirant/Applicant tabs.
//
// THIS HOOK IS THE HEADER BADGE ONLY. It reads `meta.unread_count`, which the server counts over
// the list as it opens whatever `limit` says, so it asks for a single row (review F-086/F-115:
// the server no longer has an unpaged form, and a request without `limit` is a page of 20 that
// nobody reads). The rows themselves are the drawer's own read, below.
//
// `pollWhileOpen` (H12 fix, frontend review 1 Sep 2026): the drawer button itself lives in the
// shell header, so it — and this hook — stay mounted for the whole session; an unconditional
// `refetchInterval` hammered `/conversations` every 15s even with the drawer never opened. The
// query still fires once on mount/focus for the unread badge, it just only POLLS while the caller
// says the drawer is actually open.
//
// The poll is itself a fallback since contract gate 8 (Wave 3 plan §6.6): while the realtime
// socket is open, `unread.changed` replaces the badge count directly, so there's nothing for the
// 15s poll to do — it switches off and resumes the instant the socket isn't open.
export function useConversations(pollWhileOpen = false) {
  const isAuthed = useAuthStore((s) => Boolean(s.accessToken))
  const realtimeOpen = useRealtimeOpen()
  return useQuery({
    queryKey: ['conversations'],
    queryFn: async ({ signal }) => {
      const { data, error } = await api.GET('/conversations', { signal, params: { query: { limit: 1 } } })
      if (error) throw new ApiError('Could not load conversations.', error)
      return data
    },
    enabled: isAuthed,
    refetchInterval: pollWhileOpen && !realtimeOpen ? 15000 : false,
  })
}

/** How many conversations the drawer asks for at a time. */
export const CONVERSATIONS_PAGE_SIZE = 20

export interface ConversationListFilters {
  /** Asked of the server. Finds anyone: people never messaged and closed conversations too. */
  search: string
  /** `filter[show_closed]=true`: closed conversations are listed as well (each row says `closed`). */
  showClosed: boolean
}

/**
 * The key of one drawer list. The search and the show-closed switch are part of it, so the answer
 * to an earlier search is never shown for a later one, and a request nobody is waiting on any more
 * is aborted through its `signal`. `lib/realtime/queryCache.ts` reads positions 2 and 3.
 */
export function conversationListKey(filters: ConversationListFilters): readonly unknown[] {
  return ['conversations', 'list', filters.search, filters.showClosed]
}

// The drawer's own paged, searched read (contract gate 7, owner Q6 2026-09-25: pages of 20, more
// on scroll, a server-side search box). Kept separate from `useConversations` above, which is the
// header badge alone. `useInfiniteQuery` accumulates pages as the drawer scrolls; a new search or
// the show-closed switch starts a new list by changing the query key.
//
// What the server lists with nothing typed (owner ruling 2026-10-06, review F-086/F-115): the
// conversations going on now — active leads and live clients that have a message — plus
// colleagues and Whole Team. Everyone else is reached by searching, or by showing closed ones.
export function useConversationsList(filters: ConversationListFilters, options: { enabled: boolean }) {
  const isAuthed = useAuthStore((s) => Boolean(s.accessToken))
  return useInfiniteQuery({
    queryKey: conversationListKey(filters),
    queryFn: async ({ pageParam, signal }: { pageParam: string | undefined; signal: AbortSignal }) => {
      const { data, error } = await api.GET('/conversations', {
        signal,
        params: {
          query: {
            cursor: pageParam,
            limit: CONVERSATIONS_PAGE_SIZE,
            search: filters.search || undefined,
            'filter[show_closed]': filters.showClosed || undefined,
          },
        },
      })
      if (error) throw new ApiError('Could not load conversations.', error)
      return data
    },
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.meta.next_cursor ?? undefined,
    enabled: isAuthed && options.enabled,
  })
}
