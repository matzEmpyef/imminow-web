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
// `pollWhileOpen` (H12 fix, frontend review 1 Sep 2026): the drawer button itself lives in the
// shell header, so it — and this hook — stay mounted for the whole session; an unconditional
// `refetchInterval` hammered `/conversations` every 15s even with the drawer never opened. The
// query still fires once on mount/focus for the unread badge, it just only POLLS while the caller
// says the drawer is actually open.
//
// The poll is itself a fallback since contract gate 8 (Wave 3 plan §6.6): while the realtime
// socket is open, `conversation.updated` patches a row in place and `unread.changed` replaces the
// badge count directly, so there's nothing for the 15s poll to do — it switches off and resumes
// the instant the socket isn't open.
export function useConversations(pollWhileOpen = false) {
  const isAuthed = useAuthStore((s) => Boolean(s.accessToken))
  const realtimeOpen = useRealtimeOpen()
  return useQuery({
    queryKey: ['conversations'],
    queryFn: async () => {
      const { data, error } = await api.GET('/conversations')
      if (error) throw new ApiError('Could not load conversations.', error)
      return data
    },
    enabled: isAuthed,
    refetchInterval: pollWhileOpen && !realtimeOpen ? 15000 : false,
  })
}

// The drawer's own paged, searched read (contract gate 7, owner Q6 2026-09-25: pages of 20, more
// on scroll, a server-side search box). Kept separate from `useConversations` above, which stays
// exactly as it was for the header badge (`meta.unread_count`, unpaged, polled while the drawer is
// open) — Q6 says explicitly "the badge count is unchanged". `useInfiniteQuery` accumulates pages
// as the drawer scrolls; `search` resets the accumulated pages by changing the query key.
export function useConversationsList(search: string, options: { enabled: boolean }) {
  const isAuthed = useAuthStore((s) => Boolean(s.accessToken))
  return useInfiniteQuery({
    queryKey: ['conversations', 'list', search],
    queryFn: async ({ pageParam }: { pageParam: string | undefined }) => {
      const { data, error } = await api.GET('/conversations', {
        params: { query: { cursor: pageParam, limit: 20, search: search || undefined } },
      })
      if (error) throw new ApiError('Could not load conversations.', error)
      return data
    },
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.meta.next_cursor ?? undefined,
    enabled: isAuthed && options.enabled,
  })
}
