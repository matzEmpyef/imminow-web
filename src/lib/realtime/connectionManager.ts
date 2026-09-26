import type { QueryClient } from '@tanstack/react-query'
import { fullJitterBackoffMs } from './backoff'
import {
  isKnownServerFrameType,
  parseRealtimeFrame,
  threadKey,
  type OutgoingFrame,
  type OutgoingFrameType,
  type RealtimeChatMessageData,
  type RealtimeChatStatusData,
  type RealtimeConversationUpdatedData,
  type RealtimePresenceData,
  type RealtimeReconnectData,
  type RealtimeThreadRef,
  type RealtimeUnreadChangedData,
} from './frame'
import {
  applyChatMessage,
  applyChatStatus,
  applyConversationUpdated,
  applyNotificationCreated,
  applyResync,
  applyUnreadChanged,
} from './queryCache'
import { setRealtimeStatus, setThreadPresence } from './store'

/** The subset of `WebSocket` the manager touches — real sockets satisfy it as-is; tests supply a
 * fake that does too, without needing jsdom's own (unimplemented) WebSocket. */
export interface RealtimeSocketLike {
  onopen: ((this: RealtimeSocketLike, ev: unknown) => void) | null
  onmessage: ((this: RealtimeSocketLike, ev: { data: string }) => void) | null
  onclose: ((this: RealtimeSocketLike, ev: { code: number; reason?: string }) => void) | null
  onerror: ((this: RealtimeSocketLike, ev: unknown) => void) | null
  send(data: string): void
  close(code?: number, reason?: string): void
}

export type TicketResult =
  | { ok: true; url: string }
  | { ok: false; reason: 'disabled'; retryAfterS: number }
  | { ok: false; reason: 'rate_limited' }
  | { ok: false; reason: 'error' }

export interface RealtimeConnectionManagerDeps {
  queryClient: QueryClient
  /** Requests a fresh ticket (`POST /realtime/tickets`) and classifies the answer — kept outside
   * the manager so tests don't need to mock the API client's transport. */
  fetchTicket: () => Promise<TicketResult>
  /** Whether there's a session to open a socket for at all; consulted right before every connect
   * attempt, since a reconnect timer can fire after sign-out. */
  isSignedIn: () => boolean
  /** Defaults to the global `WebSocket`; tests inject a fake. */
  wsFactory?: (url: string) => RealtimeSocketLike
  /** Defaults to `Math.random`; tests inject a fixed sequence for deterministic backoff assertions. */
  random?: () => number
  /** Defaults to `Date.now`; tests inject a controllable clock. */
  now?: () => number
  /** Default 60s — how long a repeated 4403 (ticket rejected twice in a row) parks the manager in
   * `disabled` before trying again, per asyncapi.yaml: "take a new ticket once; poll if it happens
   * again." */
  repeatedForbiddenRetryS?: number
}

/**
 * One connection manager for the whole signed-in session (Wave 3 plan §6.6): ticket → connect →
 * `hello` → `resume` → dispatch, reconnecting with backoff, honouring the server's `reconnect` and
 * the ticket route's `retry_after_s`, stopping on sign-out/session-end. Nothing in here is
 * React — `src/lib/realtime/bootstrap.ts` wires a single instance to `authStore`, and
 * `store.ts`'s `useRealtimeOpen()` is how components/queries read its state.
 */
export class RealtimeConnectionManager {
  private status: 'idle' | 'connecting' | 'open' | 'reconnecting' | 'disabled' | 'stopped' = 'idle'
  private started = false
  /** Bumped on every `stop()`/`start()` cycle so timers and socket callbacks scheduled by a
   * previous cycle recognise they're stale and no-op instead of acting on a dead connection. */
  private generation = 0
  private socket: RealtimeSocketLike | null = null
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null
  private reconnectFrameTimer: ReturnType<typeof setTimeout> | null = null
  private flushTimer: ReturnType<typeof setTimeout> | null = null
  private attempt = 0
  private consecutiveForbidden = 0
  /** True while a `reconnect` frame's own timer is going to redial us — the close that follows
   * (1012, ~20s later) must not ALSO schedule a reconnect on top of it. */
  private serverReconnectPending = false
  private lastResumeId: string | null = null
  private viewingSubject: RealtimeThreadRef | null = null
  private outQueue: OutgoingFrame[] = []
  private readonly deps: RealtimeConnectionManagerDeps

  constructor(deps: RealtimeConnectionManagerDeps) {
    this.deps = deps
  }

  getStatus() {
    return this.status
  }

  /** Idempotent — a second call while already started/starting does nothing. */
  start(): void {
    if (this.started) return
    this.started = true
    this.attempt = 0
    this.consecutiveForbidden = 0
    void this.connect()
  }

  /** Stops for good until the next `start()` — signed out, or the console's idle lock. Closes any
   * open socket without triggering a reconnect. */
  stop(): void {
    this.started = false
    this.generation++
    this.clearTimers()
    this.outQueue = []
    this.closeSocketSilently()
    this.setStatus('stopped')
  }

  /** Which thread (if any) is on screen right now — sent as `viewing` immediately if the socket is
   * open, and repeated on every `hello`/`ping` from then on (asyncapi.yaml). Presence and the
   * server's push suppression both key off this. */
  setViewing(subject: RealtimeThreadRef | null): void {
    this.viewingSubject = subject
    this.sendViewingIfOpen()
  }

  private setStatus(status: RealtimeConnectionManager['status'], disabledUntil: number | null = null) {
    this.status = status
    setRealtimeStatus(status, disabledUntil)
  }

  private clearTimers() {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer)
    if (this.reconnectFrameTimer) clearTimeout(this.reconnectFrameTimer)
    if (this.flushTimer) clearTimeout(this.flushTimer)
    this.reconnectTimer = null
    this.reconnectFrameTimer = null
    this.flushTimer = null
  }

  private closeSocketSilently() {
    const socket = this.socket
    this.socket = null
    if (!socket) return
    socket.onopen = null
    socket.onmessage = null
    socket.onclose = null
    socket.onerror = null
    try {
      socket.close(1000)
    } catch {
      /* already closed */
    }
  }

  private scheduleReconnect() {
    if (!this.started) return
    const delay = fullJitterBackoffMs(this.attempt, this.deps.random)
    this.attempt++
    this.setStatus('reconnecting')
    const gen = this.generation
    this.reconnectTimer = setTimeout(() => {
      if (gen !== this.generation) return
      void this.connect()
    }, delay)
  }

  private scheduleDisabledRetry(retryAfterS: number) {
    const gen = this.generation
    const now = this.deps.now?.() ?? Date.now()
    this.setStatus('disabled', now + retryAfterS * 1000)
    this.reconnectTimer = setTimeout(() => {
      if (gen !== this.generation) return
      void this.connect()
    }, retryAfterS * 1000)
  }

  private async connect(): Promise<void> {
    if (!this.started) return
    if (!this.deps.isSignedIn()) {
      this.stop()
      return
    }
    this.setStatus('connecting')
    const gen = this.generation
    const result = await this.deps.fetchTicket()
    if (gen !== this.generation || !this.started) return

    if (!result.ok) {
      if (result.reason === 'disabled') {
        this.scheduleDisabledRetry(result.retryAfterS)
      } else {
        // rate_limited or a plain error — back off and try again; both are transient.
        this.scheduleReconnect()
      }
      return
    }
    this.openSocket(result.url)
  }

  private openSocket(url: string) {
    const factory = this.deps.wsFactory ?? defaultWsFactory
    const socket = factory(url)
    this.socket = socket
    const gen = this.generation
    socket.onmessage = (ev) => {
      if (gen === this.generation) this.handleMessage(ev.data)
    }
    socket.onclose = (ev) => {
      if (gen === this.generation) this.handleClose(ev.code)
    }
    socket.onerror = () => {
      /* the close handler that follows carries the reconnect decision */
    }
  }

  private handleMessage(raw: string) {
    const frame = parseRealtimeFrame(raw)
    if (!frame) return
    if (!isKnownServerFrameType(frame.type)) return // new/unrecognised signal — ignore, per contract
    if (frame.id) this.lastResumeId = frame.id

    switch (frame.type) {
      case 'hello': {
        // RealtimeHelloData carries heartbeat_s and resume_id; neither is read here — the server's
        // resume_id is the newest position IT holds, but we resume from OUR OWN lastResumeId (the
        // last frame we actually received), which may be older after a dropped connection.
        this.attempt = 0
        this.consecutiveForbidden = 0
        this.setStatus('open')
        // "resume … must be the first client frame after hello" — sent before viewing, below.
        if (this.lastResumeId) {
          this.enqueue('resume', { last_id: this.lastResumeId })
        }
        this.sendViewingIfOpen()
        break
      }
      case 'ping':
        this.enqueue('pong', {})
        this.sendViewingIfOpen()
        break
      case 'chat.message': {
        const data = frame.data as RealtimeChatMessageData
        applyChatMessage(this.deps.queryClient, data.thread, data.message)
        if (frame.id) this.enqueue('ack', { id: frame.id })
        break
      }
      case 'chat.delivered':
      case 'chat.read': {
        const data = frame.data as RealtimeChatStatusData
        applyChatStatus(
          this.deps.queryClient,
          data.thread,
          frame.type === 'chat.read' ? 'read' : 'delivered',
          data.side,
          data.up_to,
        )
        break
      }
      case 'conversation.updated': {
        const data = frame.data as RealtimeConversationUpdatedData
        applyConversationUpdated(this.deps.queryClient, data.conversation)
        break
      }
      case 'unread.changed': {
        const data = frame.data as RealtimeUnreadChangedData
        applyUnreadChanged(this.deps.queryClient, data)
        break
      }
      case 'presence': {
        const data = frame.data as RealtimePresenceData
        setThreadPresence(threadKey(data.thread), data.online)
        break
      }
      case 'notification.created':
        applyNotificationCreated(this.deps.queryClient)
        break
      case 'resync':
        applyResync(this.deps.queryClient, this.viewingSubject)
        break
      case 'reconnect': {
        const data = frame.data as RealtimeReconnectData
        this.serverReconnectPending = true
        const gen = this.generation
        this.reconnectFrameTimer = setTimeout(() => {
          if (gen !== this.generation) return
          this.closeSocketSilently()
          void this.connect()
        }, Math.max(0, data.after_ms))
        break
      }
    }
  }

  private handleClose(code: number) {
    this.socket = null
    if (!this.started) {
      this.setStatus('stopped')
      return
    }
    if (code === 4401) {
      // session_ended — the app's normal auth flow (401 refresh, or endSession's sign-out) takes
      // it from here; we don't retry on our own account.
      this.started = false
      this.setStatus('stopped')
      return
    }
    if (code === 4403) {
      this.consecutiveForbidden++
      if (this.consecutiveForbidden >= 2) {
        // "take a new ticket once; poll if it happens again" (asyncapi.yaml) — two in a row means
        // something is genuinely wrong; fall back to polling for a while rather than spinning.
        this.scheduleDisabledRetry(this.deps.repeatedForbiddenRetryS ?? 60)
        return
      }
      void this.connect()
      return
    }
    this.consecutiveForbidden = 0
    if (this.serverReconnectPending) {
      // Already being redialed by the `reconnect` frame's own timer (1012 follows it ~20s later);
      // scheduling a second reconnect here would race it.
      this.serverReconnectPending = false
      return
    }
    // 4408 slow_consumer, 4429 rate_limited, 1012 restart, 1000/1001, or anything else — reconnect
    // with backoff and resume from lastResumeId.
    this.scheduleReconnect()
  }

  private sendViewingIfOpen() {
    if (this.status !== 'open') return
    this.enqueue('viewing', { subject: this.viewingSubject })
  }

  /** Queues an outbound frame and paces delivery to comfortably clear the ≤10/s client limit
   * (asyncapi.yaml "Limits") — sends immediately if nothing is in flight, else waits for the
   * previous send's 110ms spacing. Our own traffic (resume once, viewing on nav, one ack per
   * message, one pong per heartbeat) never comes close, but a burst of acks for a batch of
   * replayed messages after `resume` is exactly the case this exists for. */
  private enqueue(type: OutgoingFrameType, data: unknown) {
    this.outQueue.push({ v: 1, type, ts: new Date().toISOString(), data })
    if (!this.flushTimer) this.pump()
  }

  private pump() {
    if (!this.socket || this.outQueue.length === 0) return
    const frame = this.outQueue.shift()!
    try {
      this.socket.send(JSON.stringify(frame))
    } catch {
      /* the close handler will decide what happens next */
    }
    if (this.outQueue.length > 0) {
      this.flushTimer = setTimeout(() => {
        this.flushTimer = null
        this.pump()
      }, 110)
    }
  }
}

function defaultWsFactory(url: string): RealtimeSocketLike {
  return new WebSocket(url) as unknown as RealtimeSocketLike
}
