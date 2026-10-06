import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useMutation } from '@/lib/useSave'
import { api } from '@/api/client'
import { useAuthStore } from '@/stores/authStore'
import { ApiError } from './auth'

export function useTags() {
  const isAuthed = useAuthStore((s) => Boolean(s.accessToken))
  return useQuery({
    queryKey: ['tags'],
    queryFn: async ({ signal }) => {
      const { data, error } = await api.GET('/tags', { signal })
      if (error) throw new ApiError('Could not load tags.', error)
      return data
    },
    enabled: isAuthed,
  })
}

export function useCreateTag() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (name: string) => {
      const { data, error } = await api.POST('/tags', { body: { name } })
      if (error) throw new ApiError('Could not create this tag.', error)
      return data
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['tags'] }),
  })
}

export function useDeleteTag() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await api.DELETE('/tags/{id}', { params: { path: { id } } })
      if (error) throw new ApiError('Could not delete this tag.', error)
    },
    // A deleted tag also comes off every lead, client and document that carried it (review
    // F-156): those lists kept showing it until they next reloaded on their own.
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tags'] })
      queryClient.invalidateQueries({ queryKey: ['leads'] })
      queryClient.invalidateQueries({ queryKey: ['clients'] })
      queryClient.invalidateQueries({ queryKey: ['document-library'] })
    },
  })
}
