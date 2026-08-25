import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/api/client'
import { useAuthStore } from '@/stores/authStore'
import { ApiError } from './auth'
import type { components } from '@/api/schema'

type BlogCategoryMappingInput = components['schemas']['BlogCategoryMappingInput']

export function useBlogCategoryMappings() {
  const isAuthed = useAuthStore((s) => Boolean(s.accessToken))
  return useQuery({
    queryKey: ['blog-category-mappings'],
    queryFn: async () => {
      const { data, error } = await api.GET('/blog/category-mappings')
      if (error) throw new ApiError('Could not load category mappings.')
      return data
    },
    enabled: isAuthed,
  })
}

/**
 * PATCH is a partial update, so the body is `Partial<Input>` rather than the full Input shape.
 *
 * It was typed as the full Input, which forced every caller that only wanted to flip `active` or
 * edit `label` to pass `wp_category`/`app_tag` back in — or to cast the call and lose the checking
 * altogether. Widening the type here is the fix; casting at the call site would only have hidden
 * a mismatch that `tsconfig.app.json` (no `strict`) can't catch on its own.
 */
export function useUpdateMapping(id: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (body: Partial<BlogCategoryMappingInput> & { label?: string }) => {
      const { data, error } = await api.PATCH('/blog/category-mappings/{id}', { params: { path: { id } }, body })
      if (error) throw new ApiError('Could not update this mapping.')
      return data
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['blog-category-mappings'] }),
  })
}
