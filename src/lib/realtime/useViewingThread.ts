import { useEffect } from 'react'
import { realtimeManager } from './bootstrap'

/**
 * Tells the realtime manager which thread (if any) is on screen — `viewing` frames drive presence
 * and the server's push suppression (Wave 3 plan §6.3). Call from a conversation screen with the
 * thread it renders; unmounting (navigating away, closing the floating window) clears it back to
 * null rather than leaving a stale "viewing" behind.
 *
 * Takes the primitive `type`/`id` rather than a `RealtimeThreadRef` object so the effect's
 * dependency array doesn't retrigger on every render over a freshly-allocated object.
 */
export function useViewingThread(type: 'lead' | 'client' | null, id: string | null | undefined): void {
  useEffect(() => {
    if (!type || !id) return undefined
    realtimeManager.setViewing({ type, id })
    return () => realtimeManager.setViewing(null)
  }, [type, id])
}
