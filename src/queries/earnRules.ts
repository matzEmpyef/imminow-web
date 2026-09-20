import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/api/client'
import { useAuthStore } from '@/stores/authStore'
import { ApiError } from './auth'

export function useEarnRules() {
  const isAuthed = useAuthStore((s) => Boolean(s.accessToken))
  return useQuery({
    queryKey: ['earn-rules'],
    queryFn: async () => {
      const { data, error } = await api.GET('/points/earn-rules')
      if (error) throw new ApiError('Could not load earn rules.', error)
      return data
    },
    enabled: isAuthed,
  })
}

/**
 * THE PROFILE MILESTONES, SERVED (assumptions audit M31, product owner 2026-09-19).
 *
 * 30 / 70 / 100 were written into the app's completion meter and into this console's own copy
 * beside each `profile_*_percent` rule. Moving one would have left a bar promising points already
 * paid, and a settings page describing a threshold that no longer earns anything. They ride on
 * `GET /points/balance` because that is the call that also carries the rules that pay them.
 *
 * The `balance` and `earned` fields in that response are the CALLER's own and mean nothing to an
 * immiNow admin; only `threshold` / `trigger` / `reason` are platform facts, and only those are
 * read here.
 */
export function useProfileMilestones() {
  const isAuthed = useAuthStore((s) => Boolean(s.accessToken))
  return useQuery({
    queryKey: ['points-balance', 'profile-milestones'],
    queryFn: async () => {
      const { data, error } = await api.GET('/points/balance')
      if (error) throw new ApiError('Could not load the profile milestones.', error)
      return data.profile_milestones ?? []
    },
    enabled: isAuthed,
    staleTime: 30 * 60 * 1000,
  })
}

export function useUpdateEarnRule(id: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (body: {
      points_value?: number
      cap?: number | null
      /**
       * How many TIMES the rule may credit one student, as distinct from how many points
       * (assumptions audit M14, product owner 2026-09-19) — `daily_login` was uncapped for life,
       * so opening the app every day for ten years earned 18,250 points nobody decided to owe.
       */
      award_cap?: number | null
      /**
       * Whether the two caps above are read over a LIFETIME or over a DAY (product owner,
       * 2026-09-20: "article_read and view consultancy points should have daily cap instead of
       * life time"). A daily cap paces; a lifetime cap on the same trigger says the fiftieth
       * article a student ever reads is worth nothing, forever.
       */
      cap_period?: 'lifetime' | 'day'
      active?: boolean
    }) => {
      const { data, error } = await api.PATCH('/points/earn-rules/{id}', { params: { path: { id } }, body })
      if (error) throw new ApiError('Could not update this rule.', error)
      return data
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['earn-rules'] }),
  })
}
