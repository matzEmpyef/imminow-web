import { WifiOff } from 'lucide-react'
import { useIsOnline } from '@/lib/useIsOnline'

/**
 * Says the connection is gone while it is gone (review F-150) — mounted once, in main.tsx, above
 * every page. Without it a person offline saw lists that would not load and saves that failed one
 * by one, with nothing saying why. It floats over the page rather than pushing it down, so the
 * form someone is filling in does not jump when the Wi-Fi drops, and it goes away by itself the
 * moment the connection is back.
 */
export function OfflineBanner() {
  const online = useIsOnline()
  if (online) return null
  return (
    <div className="pointer-events-none fixed inset-x-0 top-sm z-50 flex justify-center px-md">
      <div
        role="status"
        aria-live="polite"
        className="pointer-events-auto flex max-w-[36rem] items-center gap-sm rounded-lg border border-warning bg-warning-subtle px-md py-sm shadow-card"
      >
        <WifiOff className="h-4 w-4 shrink-0 text-warning" aria-hidden />
        <p className="text-body-sm text-text-primary">
          <span className="font-medium">You are offline.</span> Changes cannot be saved until the connection is back.
        </p>
      </div>
    </div>
  )
}
