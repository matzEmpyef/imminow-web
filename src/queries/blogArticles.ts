import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/api/client'
import { useAuthStore } from '@/stores/authStore'
import { ApiError } from './auth'
import type { components } from '@/api/schema'

type BlogArticle = components['schemas']['BlogArticle']

const ARTICLES_KEY = ['blog-articles']

export function useBlogArticles() {
  const isAuthed = useAuthStore((s) => Boolean(s.accessToken))
  return useQuery({
    queryKey: ARTICLES_KEY,
    queryFn: async () => {
      const { data, error } = await api.GET('/blog')
      if (error) throw new ApiError('Could not load articles.', error)
      return data
    },
    enabled: isAuthed,
  })
}

/**
 * Paste a URL, see what would be added — persists nothing.
 *
 * Backs both the Add Article prefill and the Preview button. This is the only point in the whole
 * flow where a bad render is catchable before students meet it, which is why the modal shows the
 * rendered body and not just the metadata.
 */
export function useResolveArticle() {
  return useMutation({
    mutationFn: async (sourceUrl: string) => {
      const { data, error, response } = await api.POST('/blog/resolve', {
        body: { source_url: sourceUrl },
      })
      // These three are the failures an admin can actually act on, so each says what to do rather
      // than collapsing into one "something went wrong".
      if (error) {
        if (response.status === 422) throw new ApiError('That link is not a Sentpo article URL.', error)
        if (response.status === 404) throw new ApiError('No published article matches that link.', error)
        if (response.status === 502) throw new ApiError('The Sentpo site is not responding. Try again shortly.', error)
        throw new ApiError('Could not read that article.', error)
      }
      return data as BlogArticle & { already_curated?: boolean }
    },
  })
}

export function useAddArticle() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (body: { source_url: string; category_ids?: string[] }) => {
      const { data, error } = await api.POST('/blog', { body })
      // The server rejects a URL that is already in the app with a 409 naming the existing
      // article (2026-08-22). Its message is the only thing that distinguishes that from a real
      // failure, so it is surfaced verbatim rather than flattened into the generic sentence.
      if (error) throw new ApiError(error.error?.message ?? 'Could not add this article.')
      return data
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ARTICLES_KEY }),
  })
}

export function useUpdateArticle() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, ...body }: { id: string; published_to_app?: boolean; category_ids?: string[] }) => {
      const { data, error } = await api.PATCH('/blog/{id}', { params: { path: { id } }, body })
      if (error) throw new ApiError('Could not update this article.', error)
      return data
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ARTICLES_KEY }),
  })
}

/** Force a re-fetch ahead of the TTL. On failure the cached copy is left as it was. */
export function useRefreshArticle() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { data, error, response } = await api.POST('/blog/{id}/refresh', {
        params: { path: { id } },
      })
      if (error) {
        if (response.status === 502) {
          throw new ApiError('The Sentpo site is not responding — the article is unchanged.', error)
        }
        throw new ApiError('Could not refresh this article.', error)
      }
      return data
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ARTICLES_KEY }),
  })
}
