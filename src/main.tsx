import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AppErrorBoundary } from './components/AppErrorBoundary.tsx'
import { ApiError } from './queries/auth.ts'
import { startAnalytics } from './lib/analytics.ts'
import './index.css'
import App from './App.tsx'

// Defaults set 2026-08-25. This was a bare `new QueryClient()`, inheriting React Query's own
// defaults — which optimise for always-fresh data at any cost in traffic, a poor fit for a console
// staff keep open all day.
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // The important one. The default is 0, meaning every result is stale the instant it lands, so
      // every remount refetched — and because window-focus refetching only fires for STALE queries,
      // every alt-tab back to the browser refetched the whole page too. 30s keeps navigation
      // responsive and still feels live; focus refetching is deliberately left on, since it now
      // costs a request only when the data really is old.
      staleTime: 30_000,
      gcTime: 5 * 60_000,
      // The default retries three times with backoff. An ApiError means the server gave a
      // definitive answer — a 403 or a 404 returns the same thing however many times it is asked,
      // so retrying only multiplies load and delays the message the user needs to see. Network
      // failures, which arrive as something other than ApiError, are still worth one more try.
      retry: (failureCount, error) => !(error instanceof ApiError) && failureCount < 2,
    },
  },
})

// Flushes buffered events when the tab is hidden; see lib/analytics.ts.
startAnalytics()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AppErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </QueryClientProvider>
    </AppErrorBoundary>
  </StrictMode>,
)
