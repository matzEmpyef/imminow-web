import { useSyncExternalStore } from 'react'

function subscribe(onChange: () => void) {
  window.addEventListener('online', onChange)
  window.addEventListener('offline', onChange)
  return () => {
    window.removeEventListener('online', onChange)
    window.removeEventListener('offline', onChange)
  }
}

/** Whether the browser reports a network. Follows the browser's own online/offline events. */
export function useIsOnline(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => navigator.onLine !== false,
    () => true,
  )
}
