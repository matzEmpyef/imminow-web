import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/api/client'
import { useAuthStore } from '@/stores/authStore'
import { ApiError } from './auth'

// Shared reference list (user-requested) — backs the Countries Served multiselect on
// Consultancy Management's Profile tab, plus the other country fields wired to it. Rarely
// changes, so a long staleTime is fine.
export function useCountries() {
  const isAuthed = useAuthStore((s) => Boolean(s.accessToken))
  return useQuery({
    queryKey: ['countries'],
    queryFn: async () => {
      const { data, error } = await api.GET('/countries')
      if (error) throw new ApiError('Could not load the countries list.', error)
      return data
    },
    enabled: isAuthed,
    staleTime: 30 * 60 * 1000,
  })
}

// Super Admin only (user-requested) — manages the list every consultancy reads from above.
export function useCreateCountry() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (name: string) => {
      const { data, error } = await api.POST('/countries', { body: { name } })
      if (error) throw new ApiError('Could not add this country.', error)
      return data
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['countries'] }),
  })
}

export function useDeleteCountry() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (name: string) => {
      const { error } = await api.DELETE('/countries/{name}', { params: { path: { name } } })
      if (error) throw new ApiError('Could not remove this country.', error)
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['countries'] }),
  })
}
