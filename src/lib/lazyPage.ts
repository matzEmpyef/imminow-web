import { lazy, type ComponentType } from 'react'

/**
 * `React.lazy` for the console's pages, with one addition (review F-162): when a page's file
 * cannot be loaded, the console reloads itself once and the person lands on the page they asked
 * for.
 *
 * Why a page file goes missing: every deploy renames the files. A tab that was open before the
 * deploy still asks for the old names, the host no longer has them, and the page failed to load —
 * every open tab turned into the error card at its next click, on every deploy, until someone
 * thought to reload. A reload fetches the new build, which is the whole fix, so the console does
 * it for them.
 *
 * Once, not in a loop: a marker in sessionStorage remembers the automatic reload for a minute.
 * If the file is still missing after it (a real outage, not a deploy), the failure is shown the
 * ordinary way with its Reload button. And never while offline: reloading then would swap the
 * console for the browser's "no internet" page; the failure is shown in place instead.
 */
const MARKER = 'imminow-page-reload-at'
const ONCE_WITHIN_MS = 60_000

function reloadedJustNow(): boolean {
  try {
    const at = Number(sessionStorage.getItem(MARKER))
    return Number.isFinite(at) && at > 0 && Date.now() - at < ONCE_WITHIN_MS
  } catch {
    // Storage is unavailable: without a marker there is no way to stop at one reload.
    return true
  }
}

/** What to do when a page file failed to load. Reloads (and never settles) or rethrows. */
export function recoverFromMissingPage(error: unknown, reload: () => void = () => window.location.reload()): Promise<never> {
  const online = typeof navigator === 'undefined' || navigator.onLine !== false
  if (!online || reloadedJustNow()) throw error
  sessionStorage.setItem(MARKER, String(Date.now()))
  reload()
  // The page is going away; leave the loading state up rather than flash an error first.
  return new Promise<never>(() => {})
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- same constraint as React.lazy itself
export function lazyPage<T extends ComponentType<any>>(load: () => Promise<{ default: T }>) {
  return lazy(() => load().catch((error: unknown) => recoverFromMissingPage(error)))
}
