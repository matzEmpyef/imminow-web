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
  type RealtimeHelloData,
  type RealtimeInternalMessageData,
  type RealtimeInternalUnsentData,
  type RealtimePresenceData,
  type RealtimeReconnectData,
  type RealtimeThreadRef,
  type RealtimeUnreadChangedData,
} from './frame'
import {
  applyChatMessage,
  applyChatStatus,
  applyConversationUpdated,
  applyInternalMessage,
  applyInternalUnsent,
  applyNotificationCreated,
  applyResync,
  applyUnreadChanged,
} from './queryCache'
import { clearPresence, setRealtimeStatus, setThreadPresence } from './store'

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
  /** Default 300s — how long the manager stays in `disabled` (polling) after the browser refused
   * to even create the socket, before trying again. */
  refusedSocketRetryS?: number
  /**
   * Renews the session after the server closed the socket with 4401 `session_ended` (review
   * F-142; asyncapi.yaml: "refresh the session; reconnect with a new ticket, or sign out if the
   * refresh fails"). The same three answers as the API client's own refresh. Without it the
   * manager can only stop, as it used to.
   */
  refreshSession?: () => Promise<{ kind: 'ok' | 'rejected' | 'unavailable' }>
  /** Called when that renewal was refused: the session really is over. */
  onSessionEnded?: () => void
}

/** The server pings every `heartbeat_s`; this is assumed until its `hello` says otherwise. */
const DEFAULT_HEARTBEAT_S = 25
/**
 * How many heartbeats of silence mean the connection is dead (asyncapi.yaml: "a client that hears
 * nothing for 60 seconds reconnects" — 2.4 × the 25-second ping). More than two, so one late or
 * lost ping is not a reconnect.
 */
const SILENCE_HEARTBEATS = 2.4

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
  /**
   * Every thread on screen, oldest first (review F-142). The floating chat window and a
   * conversation page can both be open; they used to share one slot, so closing either cleared
   * the other's. The `viewing` frame names one thread — the one opened last.
   */
  private viewing: RealtimeThreadRef[] = []
  private outQueue: OutgoingFrame[] = []
  private silenceTimer: ReturnType<typeof setTimeout> | null = null
  private heartbeatS = DEFAULT_HEARTBEAT_S
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
    this.serverReconnectPending = false
    this.outQueue = []
    // Nothing of this session may reach the next one (review F-142): its place in the stream,
    // what it was looking at, and who it saw online belong to whoever was signed in.
    this.lastResumeId = null
    this.viewing = []
    this.heartbeatS = DEFAULT_HEARTBEAT_S
    clearPresence()
    this.closeSocketSilently()
    this.setStatus('stopped')
  }

  /** The thread the `viewing` frame names: the one opened last of those on screen. */
  private get viewingSubject(): RealtimeThreadRef | null {
    return this.viewing.at(-1) ?? null
  }

  /** A thread came on screen — sent as `viewing` immediately if the socket is open, and repeated
   * on every `hello`/`ping` from then on (asyncapi.yaml). Presence and the server's push
   * suppression both key off this. Pair every call with `removeViewing`. */
  addViewing(subject: RealtimeThreadRef): void {
    this.viewing.push(subject)
    this.sendViewingIfOpen()
  }

  /** A thread left the screen. Any other thread still open becomes the one being viewed. */
  removeViewing(subject: RealtimeThreadRef): void {
    const at = this.viewing.findLastIndex((v) => v.type === subject.type && v.id === subject.id)
    if (at < 0) return
    this.viewing.splice(at, 1)
    this.sendViewingIfOpen()
  }

  /** Replaces everything on screen with one thread, or with none. */
  setViewing(subject: RealtimeThreadRef | null): void {
    this.viewing = subject ? [subject] : []
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
    if (this.silenceTimer) clearTimeout(this.silenceTimer)
    this.reconnectTimer = null
    this.reconnectFrameTimer = null
    this.flushTimer = null
    this.silenceTimer = null
  }

  /**
   * (Re)starts the wait for the next frame (review F-142). The server pings every `heartbeat_s`,
   * so a socket that has said nothing for 2.4 of them is not quiet, it is dead: a connection cut
   * without a close (a sleeping laptop, a changed network, a proxy that dropped it) stays "open"
   * for ever as far as the browser can tell. Left alone, the status stayed `open`, the fallback
   * polling stayed off, and chat stopped updating with nothing on screen to say so.
   */
  private armSilenceTimer() {
    if (this.silenceTimer) clearTimeout(this.silenceTimer)
    const gen = this.generation
    this.silenceTimer = setTimeout(() => {
      this.silenceTimer = null
      if (gen !== this.generation || !this.started) return
      this.closeSocketSilently()
      this.serverReconnectPending = false
      if (this.reconnectFrameTimer) clearTimeout(this.reconnectFrameTimer)
      this.reconnectFrameTimer = null
      this.scheduleReconnect()
    }, this.heartbeatS * SILENCE_HEARTBEATS * 1000)
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
    let socket: RealtimeSocketLike
    try {
      socket = factory(url)
    } catch {
      // `new WebSocket` throws synchronously when the browser will not open the address at all —
      // the page's Content-Security-Policy does not list it, mixed content, a malformed URL. That
      // is a configuration fault, not a dropped connection: no close event will ever follow, and a
      // quick retry cannot succeed. Park in `disabled` (fallback polling carries on) and try again
      // much later, instead of stalling in `connecting` for good.
      this.scheduleDisabledRetry(this.deps.refusedSocketRetryS ?? 300)
      return
    }
    this.socket = socket
    // Frames queued for the previous socket (an ack for a message it delivered) mean nothing to
    // this one, and `resume` must be the first thing it is sent.
    this.outQueue = []
    // Counts from now, so a socket that opens and never says `hello` is caught too.
    this.armSilenceTimer()
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
    // Any well-formed frame is the server speaking, whether or not this client acts on its type.
    this.armSilenceTimer()
    if (!isKnownServerFrameType(frame.type)) return // new/unrecognised signal — ignore, per contract
    if (frame.id) this.lastResumeId = frame.id

    switch (frame.type) {
      case 'hello': {
        // RealtimeHelloData carries heartbeat_s and resume_id. `heartbeat_s` sets how long a
        // silence means the connection is dead. `resume_id` is not read — the server's is the
        // newest position IT holds, but we resume from OUR OWN lastResumeId (the last frame we
        // actually received), which may be older after a dropped connection.
        const heartbeat = (frame.data as Partial<RealtimeHelloData>).heartbeat_s
        if (typeof heartbeat === 'number' && heartbeat > 0) this.heartbeatS = heartbeat
        this.armSilenceTimer()
        this.attempt = 0
        this.consecutiveForbidden = 0
        this.setStatus('open')
        // "resume … must be the first client frame after hello" — sent before viewing, below.
        if (this.lastResumeId) {
          this.enqueue('resume', { last_id: this.lastResumeId })
        } else {
          // Nothing to resume from, so nothing will be replayed (review F-142): whatever happened
          // between each screen's own first read and this moment was missed. Polling was off or
          // slow in that gap, and a message that arrived in it would not show until the next
          // focus. Catch up the same way a `resync` does.
          applyResync(this.deps.queryClient)
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
      case 'internal.message': {
        const data = frame.data as RealtimeInternalMessageData
        applyInternalMessage(this.deps.queryClient, data.thread, data.message)
        // No ack — internal messaging has no delivered/read status frame to drive (asyncapi.yaml).
        break
      }
      case 'internal.unsent': {
        const data = frame.data as RealtimeInternalUnsentData
        applyInternalUnsent(this.deps.queryClient, data.thread, data.message_id)
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
        applyResync(this.deps.queryClient)
        break
      case 'reconnect': {
        const data = frame.data as RealtimeReconnectData
        this.serverReconnectPending = true
        const gen = this.generation
        this.reconnectFrameTimer = setTimeout(() => {
          if (gen !== this.generation) return
          // The redial this flag was announcing is happening now. Left set, it would swallow the
          // NEXT socket's first close (the old socket's handlers are removed just below, so its
          // 1012 never arrives to clear it) and that drop would never be redialed.
          this.serverReconnectPending = false
          this.closeSocketSilently()
          void this.connect()
        }, Math.max(0, data.after_ms))
        break
      }
    }
  }

  private handleClose(code: number) {
    this.socket = null
    if (this.silenceTimer) clearTimeout(this.silenceTimer)
    this.silenceTimer = null
    // Whatever was waiting to be sent was meant for the socket that just closed.
    this.outQueue = []
    if (!this.started) {
      this.setStatus('stopped')
      return
    }
    if (code === 4401) {
      void this.recoverFromSessionEnded()
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
      // scheduling a second reconnect here would race it. The socket is gone until that timer
      // fires, though, so the status must say so — fallback polling keys off "not open".
      this.serverReconnectPending = false
      this.setStatus('reconnecting')
      return
    }
    // 4408 slow_consumer, 4429 rate_limited, 1012 restart, 1000/1001, or anything else — reconnect
    // with backoff and resume from lastResumeId.
    this.scheduleReconnect()
  }

  /**
   * 4401 `session_ended` (review F-142). The contract: "refresh the session; reconnect with a new
   * ticket, or sign out if the refresh fails". This used to stop for good, which left every open
   * thread polling every five seconds for the rest of the session. Now: renew; on success take a
   * new ticket at once; when the server refuses the renewal the session is over and the app is
   * told; when the renewal could not be asked (no connection, a server error) try again later
   * like any other drop.
   */
  private async recoverFromSessionEnded(): Promise<void> {
    const refresh = this.deps.refreshSession
    if (!refresh) {
      this.started = false
      this.setStatus('stopped')
      return
    }
    this.setStatus('reconnecting')
    const gen = this.generation
    let kind: 'ok' | 'rejected' | 'unavailable'
    try {
      kind = (await refresh()).kind
    } catch {
      kind = 'unavailable'
    }
    if (gen !== this.generation || !this.started) return
    if (kind === 'ok') {
      void this.connect()
    } else if (kind === 'rejected') {
      this.stop()
      this.deps.onSessionEnded?.()
    } else {
      this.scheduleReconnect()
    }
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
