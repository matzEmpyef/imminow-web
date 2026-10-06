import { MutationCache, QueryClient } from '@tanstack/react-query'
import { isRetryable } from '@/api/errors'
import { reportFailedSave } from '@/lib/saveErrors'

// Defaults set 2026-08-25. This was a bare `new QueryClient()`, inheriting React Query's own
// defaults — which optimise for always-fresh data at any cost in traffic, a poor fit for a console
// staff keep open all day. Moved out of main.tsx (N1 fix, 2026-09-01) so `lib/session.ts` can
// clear the cache from outside the React tree — the 401 interceptor in api/client.ts is not a
// component and could never reach a client that only existed as a main.tsx local.
export const queryClient = new QueryClient({
  // Any save that fails is shown as a message unless its screen shows its own (review F-151).
  mutationCache: new MutationCache({ onError: reportFailedSave }),
  defaultOptions: {
    queries: {
      // The important one. The default is 0, meaning every result is stale the instant it lands, so
      // every remount refetched — and because window-focus refetching only fires for STALE queries,
      // every alt-tab back to the browser refetched the whole page too. 30s keeps navigation
      // responsive and still feels live; focus refetching is deliberately left on, since it now
      // costs a request only when the data really is old.
      staleTime: 30_000,
      gcTime: 5 * 60_000,
      // A read is asked again, at most twice and with React Query's own growing delay (1s, 2s),
      // only when asking again could help (review F-149): there was no answer at all, the server
      // said "too many requests", or it failed on its side — the 502/503 of a deploy, which used
      // to be shown as final while a dropped connection was retried. A considered answer (a 403,
      // a 404, a 422) is shown at once: it says the same thing however often it is asked, and
      // retrying only multiplies load and delays the message the person needs to see.
      retry: (failureCount, error) => failureCount < 2 && isRetryable(error),
    },
    mutations: {
      // A save pressed while the browser is offline fails at once, with a message (review F-150).
      // React Query's default is to hold it and send it when the connection returns — minutes
      // later, after the dialog was closed and the person had moved on, with nothing said. With
      // 'always' the request is attempted, and the console's `fetch` refuses it on the spot
      // (`api/http.ts`). Reads keep the default: they wait and load when the connection is back.
      networkMode: 'always',
    },
  },
})
