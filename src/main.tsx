import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { QueryClientProvider } from '@tanstack/react-query'
import { AppErrorBoundary } from './components/AppErrorBoundary.tsx'
import { queryClient } from './lib/queryClient.ts'
import { startAnalytics } from './lib/analytics.ts'
import './index.css'
import App from './App.tsx'

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
