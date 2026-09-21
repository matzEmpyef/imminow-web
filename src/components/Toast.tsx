import { useEffect } from 'react'
import { AlertCircle, CheckCircle2, Info, X } from 'lucide-react'
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

  const Icon = toast.tone === 'error' ? AlertCircle : toast.tone === 'info' ? Info : CheckCircle2
  const iconTone = toast.tone === 'error' ? 'text-error' : toast.tone === 'info' ? 'text-info' : 'text-success'
  return (
    <div
      role={toast.tone === 'error' ? 'alert' : 'status'}
      aria-live={toast.tone === 'error' ? 'assertive' : 'polite'}
      // A cap plus `break-words`, added alongside the 'info' tone (2026-09-18) — every message
      // before it was a short confirmation; the first genuinely explanatory one ("sent to immiNow
      // for approval, changed too recently to apply directly") ran the card off the right edge on
      // a bottom-right-anchored, unconstrained-width toast.
      //
      // `max-w-[24rem]`, NOT `max-w-sm`: this project's spacing scale reuses the key names of
      // Tailwind's named max-width scale, so `max-w-sm` resolves to the 8px SPACING token (see
      // styles/tailwind.config.ts, which calls `max-w-{xs,sm,md,lg,xl}` unusable here). It did
      // exactly that from 2026-09-18 until 2026-09-21: every toast in the console rendered as a
      // 34px-wide sliver with one character per line, on every page, because this is the one
      // shared toast. Arbitrary values bypass the broken scale.
      className="flex max-w-[24rem] items-center gap-sm rounded-lg border border-border bg-surface px-md py-sm shadow-card"
    >
      <Icon className={`h-4 w-4 shrink-0 ${iconTone}`} />
      <span className="break-words text-body-sm text-text-primary">{toast.message}</span>
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
