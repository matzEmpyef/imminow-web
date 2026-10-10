import { useQuery } from '@tanstack/react-query'
import { api } from '@/api/client'
import { ApiError } from '@/api/errors'

// The page behind the button of the webinar email (owner's ruling 2026-10-10). The link is the
// student's own, signed by the server, and WORKS ONCE: opening it while the webinar is live records
// their attendance and returns the meeting's address. Nobody is signed in; the token in the body is
// the whole credential.
//
// A query rather than a mutation so that the call is made exactly once however often the page
// mounts: React's development double-mount and any remount share the one request, and the answer
// (or the refusal) is kept for the life of the page instead of being asked for again. Nothing here
// retries: a second opening of a spent link would only be refused.
// One request per link for the life of the page, however many times the page mounts or a client is
// made: the link works once, so a second request could only be refused. It is kept here rather than
// in the `queryFn` on purpose, and takes no abort signal: React Query cancels a request whose signal
// was read when the page's observer unsubscribes (React's development double mount does exactly
// that) and then sends it again, which is the one thing this call must never do.
const attempts = new Map<string, ReturnType<typeof attend>>()

async function attend(token: string) {
  const { data, error } = await api.POST('/events/webinar-link/attend', { body: { token } })
  if (error) {
    throw new ApiError('This link could not be opened. Ask for the webinar link again from the Sentpo app.', error)
  }
  return data
}

function attendOnce(token: string) {
  let attempt = attempts.get(token)
  if (!attempt) {
    attempt = attend(token)
    attempts.set(token, attempt)
  }
  return attempt
}

export function useWebinarLinkAttend(token: string) {
  return useQuery({
    queryKey: ['webinar-link-attend', token],
    enabled: token.length > 0,
    retry: false,
    retryOnMount: false,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    staleTime: Infinity,
    gcTime: Infinity,
    queryFn: () => attendOnce(token),
  })
}
