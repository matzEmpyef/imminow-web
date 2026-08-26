import { api } from '@/api/client'

/**
 * Analytics capture (2026-08-25). Buffered and fire-and-forget.
 *
 * Three rules this deliberately follows, all of them about not mattering:
 *  - It never throws. A failed send is dropped silently — losing analytics is always preferable to
 *    disturbing someone using the console.
 *  - It never blocks. Nothing awaits it; `track()` returns immediately.
 *  - It batches. Posting per interaction would multiply request volume for the least important
 *    traffic in the product.
 *
 * `product` is NOT sent — the server derives it from the caller's role, which cannot be wrong the
 * way a client-declared value can.
 */

const FLUSH_INTERVAL_MS = 15_000
/** Matches the contract's `maxItems`. A burst larger than this flushes early rather than truncating. */
const MAX_BATCH = 200

interface QueuedEvent {
  name: string
  session_id: string
  subject_type?: string
  subject_id?: string
  properties?: Record<string, unknown>
  platform: 'web'
  app_version: string
  occurred_at: string
}

/**
 * One id per tab, generated on load. Sessions cannot be reconstructed after the fact, and almost
 * every engagement figure is per-session.
 */
const sessionId =
  typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : String(Date.now())

const appVersion = import.meta.env.VITE_APP_VERSION ?? 'dev'

let queue: QueuedEvent[] = []
let timer: ReturnType<typeof setInterval> | null = null

async function flush() {
  if (queue.length === 0) return
  const batch = queue
  queue = []
  try {
    await api.POST('/analytics/events', { body: { events: batch } })
  } catch {
    // Deliberately swallowed and NOT re-queued. Retrying would let a persistent failure grow the
    // buffer without limit, which is a real problem in service of data that does not matter.
  }
}

export function track(
  name: string,
  options: { subjectType?: string; subjectId?: string; properties?: Record<string, unknown> } = {},
) {
  queue.push({
    name,
    session_id: sessionId,
    subject_type: options.subjectType,
    subject_id: options.subjectId,
    properties: options.properties,
    platform: 'web',
    app_version: appVersion,
    occurred_at: new Date().toISOString(),
  })
  if (queue.length >= MAX_BATCH) void flush()
  timer ??= setInterval(() => void flush(), FLUSH_INTERVAL_MS)
}

/**
 * Flushes on tab close. `visibilitychange` rather than `beforeunload`, which is unreliable on
 * mobile browsers and never fires when a tab is discarded in the background.
 */
export function startAnalytics() {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') void flush()
  })
}
