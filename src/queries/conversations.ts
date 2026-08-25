import { useQuery } from '@tanstack/react-query'
import { api } from '@/api/client'
import { useAuthStore } from '@/stores/authStore'
import { ApiError } from './auth'

// Global Chat Drawer feed — every lead + client conversation merged newest-first, plus (Ultimate
// tier) the same colleague-DM/Team rows Internal Messaging lists. Removed 2026-08-19 on a
// misread instruction and restored 2026-08-20 (user: "I want it. I don't think I asked you to
// remove it, I asked to not do a tab feature for Aspirants and Applicants") — hence one merged
// list, deliberately never split into Aspirant/Applicant tabs.
export function useConversations() {
  const isAuthed = useAuthStore((s) => Boolean(s.accessToken))
  return useQuery({
    queryKey: ['conversations'],
    queryFn: async () => {
      const { data, error } = await api.GET('/conversations')
      if (error) throw new ApiError('Could not load conversations.')
      return data
    },
    enabled: isAuthed,
    refetchInterval: 15000,
  })
}
