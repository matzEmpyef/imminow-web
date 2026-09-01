import { useQuery } from '@tanstack/react-query'
import { api } from '@/api/client'
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
export function useConversations(pollWhileOpen = false) {
  const isAuthed = useAuthStore((s) => Boolean(s.accessToken))
  return useQuery({
    queryKey: ['conversations'],
    queryFn: async () => {
      const { data, error } = await api.GET('/conversations')
      if (error) throw new ApiError('Could not load conversations.', error)
      return data
    },
    enabled: isAuthed,
    refetchInterval: pollWhileOpen ? 15000 : false,
  })
}
