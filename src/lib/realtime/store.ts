import { create } from 'zustand'

/**
 * The realtime socket's own lifecycle, separate from `authStore` (which is signed-in/out) and from
 * TanStack Query (which holds the DATA the socket updates, not the socket's own state). Queries
 * read `open` alone to decide whether to keep polling (Wave 3 plan §6.6) — everything else here is
 * for diagnostics/UI (a status dot, tests), not a polling decision.
 *
 * - `idle` — never started this session (signed out, or not started yet).
 * - `connecting` — a ticket request or socket handshake is in flight.
 * - `open` — `hello` received; frames are flowing.
 * - `reconnecting` — the socket dropped and a backoff timer is pending.
 * - `disabled` — the ticket route answered 503 `realtime_disabled` (the mock, a server flag, or
 *   Redis down); `disabledUntil` is when the manager tries again.
 * - `stopped` — told to stop (signed out, idle-locked) or the session ended (4401); requires an
 *   explicit `start()` to resume.
 */
export type RealtimeStatus = 'idle' | 'connecting' | 'open' | 'reconnecting' | 'disabled' | 'stopped'

interface RealtimeState {
  status: RealtimeStatus
  /** Epoch ms the manager will next retry, meaningful only while `status === 'disabled'`. */
  disabledUntil: number | null
  /** `presence` frames by `"lead:<id>"`/`"client:<id>"` — the counterpart's live-connection state
   * for a thread this user is also in. Nothing here means "unknown", not "offline". */
  presenceByThread: Record<string, boolean>
}

export const useRealtimeStore = create<RealtimeState>(() => ({
  status: 'idle',
  disabledUntil: null,
  presenceByThread: {},
}))

export function setRealtimeStatus(status: RealtimeStatus, disabledUntil: number | null = null) {
  useRealtimeStore.setState({ status, disabledUntil })
}

export function setThreadPresence(key: string, online: boolean) {
  useRealtimeStore.setState((s) => ({ presenceByThread: { ...s.presenceByThread, [key]: online } }))
}

/** Whether the socket is up right now — queries use this to skip polling (`refetchInterval`
 * false while true) and fall straight back to it the instant this flips false. */
export function useRealtimeOpen(): boolean {
  return useRealtimeStore((s) => s.status === 'open')
}

export function useRealtimeStatus(): RealtimeStatus {
  return useRealtimeStore((s) => s.status)
}

export function usePresence(threadType: 'lead' | 'client', id: string | null | undefined): boolean {
  return useRealtimeStore((s) => (id ? (s.presenceByThread[`${threadType}:${id}`] ?? false) : false))
}
