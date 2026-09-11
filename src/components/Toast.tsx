import { useEffect } from 'react'
import { AlertCircle, CheckCircle2, X } from 'lucide-react'
import { useToastStore, type ToastItem } from '@/lib/toast'

// Where `showToast()` (lib/toast.ts) messages appear — mounted once, in main.tsx.

// Enough to read, short enough not to linger over the next thing someone does.
const TOAST_MS = 5000

function ToastCard({ toast }: { toast: ToastItem }) {
  const dismiss = useToastStore((state) => state.dismiss)

  useEffect(() => {
    const timer = setTimeout(() => dismiss(toast.id), TOAST_MS)
    return () => clearTimeout(timer)
  }, [toast.id, dismiss])

  const Icon = toast.tone === 'error' ? AlertCircle : CheckCircle2
  return (
    <div
      role={toast.tone === 'error' ? 'alert' : 'status'}
      aria-live={toast.tone === 'error' ? 'assertive' : 'polite'}
      className="flex items-center gap-sm rounded-lg border border-border bg-surface px-md py-sm shadow-card"
    >
      <Icon className={`h-4 w-4 shrink-0 ${toast.tone === 'error' ? 'text-error' : 'text-success'}`} />
      <span className="text-body-sm text-text-primary">{toast.message}</span>
      <button
        type="button"
        onClick={() => dismiss(toast.id)}
        aria-label="Dismiss"
        className="flex h-6 w-6 items-center justify-center rounded-md text-text-secondary hover:bg-background hover:text-text-primary"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  )
}

export function ToastViewport() {
  const toasts = useToastStore((state) => state.toasts)
  if (toasts.length === 0) return null
  return (
    <div className="fixed bottom-lg right-lg z-50 flex flex-col items-end gap-sm">
      {toasts.map((toast) => (
        <ToastCard key={toast.id} toast={toast} />
      ))}
    </div>
  )
}
