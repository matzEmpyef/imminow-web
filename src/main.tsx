import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { QueryClientProvider } from '@tanstack/react-query'
import { AppErrorBoundary } from './components/AppErrorBoundary.tsx'
import { ToastViewport } from './components/Toast.tsx'
import { IdleWarningModal } from './components/IdleWarningModal.tsx'
import { queryClient } from './lib/queryClient.ts'
import { startAnalytics } from './lib/analytics.ts'
import { startRealtime } from './lib/realtime'
import { startIdleLock } from './lib/idleLock'
import './index.css'
import App from './App.tsx'

// Flushes buffered events when the tab is hidden; see lib/analytics.ts.
startAnalytics()
// The one realtime connection manager for the tab (contract gate 8, Wave 3 plan §6.6) — started
// here, outside the React tree, the same way analytics is; see lib/realtime/bootstrap.ts.
startRealtime()
// The console's idle lock (PROGRESS.md Pre-Production Checklist "Idle auto-lock"; TRD Section 9) —
// same shape as startRealtime() above, started outside the React tree so it runs before anything
// mounts; see lib/idleLock/bootstrap.ts.
startIdleLock()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AppErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <App />
          <ToastViewport />
          <IdleWarningModal />
        </BrowserRouter>
      </QueryClientProvider>
    </AppErrorBoundary>
  </StrictMode>,
)
