import { QueryClient } from '@tanstack/react-query'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  RealtimeConnectionManager,
  type RealtimeConnectionManagerDeps,
  type RealtimeSocketLike,
  type TicketResult,
} from './connectionManager'
import { useRealtimeStore } from './store'

/** A `RealtimeSocketLike` double — no real network, no jsdom WebSocket dependency. Tests drive it
 * with `emitMessage`/`emitClose` and inspect `sent` for what the manager wrote back. */
class FakeSocket implements RealtimeSocketLike {
  onopen: RealtimeSocketLike['onopen'] = null
  onmessage: RealtimeSocketLike['onmessage'] = null
  onclose: RealtimeSocketLike['onclose'] = null
  onerror: RealtimeSocketLike['onerror'] = null
  sent: unknown[] = []
  closed = false

  send(data: string) {
    this.sent.push(JSON.parse(data))
  }

  close() {
    this.closed = true
  }

  emitMessage(frame: unknown) {
    this.onmessage?.({ data: JSON.stringify(frame) })
  }

  emitClose(code: number) {
    this.onclose?.({ code })
  }
}

function helloFrame(resumeId: string | null = null) {
  return { v: 1, type: 'hello', id: null, ts: '2026-09-26T00:00:00Z', data: { heartbeat_s: 25, resume_id: resumeId } }
}

describe('RealtimeConnectionManager', () => {
  let queryClient: QueryClient
  let sockets: FakeSocket[]
  let fetchTicket: ReturnType<typeof vi.fn<() => Promise<TicketResult>>>
  let signedIn: boolean

  function makeManager(overrides: Partial<RealtimeConnectionManagerDeps> = {}) {
    return new RealtimeConnectionManager({
      queryClient,
      fetchTicket,
      isSignedIn: () => signedIn,
      wsFactory: () => {
        const socket = new FakeSocket()
        sockets.push(socket)
        return socket
      },
      random: () => 0, // full-jitter delay collapses to 0 — deterministic, timers still exercised
      now: () => 0,
      ...overrides,
    })
  }

  beforeEach(() => {
    vi.useFakeTimers()
    queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    sockets = []
    signedIn = true
    fetchTicket = vi.fn(async (): Promise<TicketResult> => ({ ok: true, url: 'wss://test/realtime' }))
    useRealtimeStore.setState({ status: 'idle', disabledUntil: null, presenceByThread: {} })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('opens a socket on start() and reaches "open" on hello', async () => {
    const manager = makeManager()
    manager.start()
    await vi.waitFor(() => expect(sockets).toHaveLength(1))

    sockets[0].emitMessage(helloFrame())
    expect(manager.getStatus()).toBe('open')
    expect(useRealtimeStore.getState().status).toBe('open')
  })

  it('sends resume as the first frame after hello, only when a prior lastResumeId exists', async () => {
    const manager = makeManager()
    manager.start()
    await vi.waitFor(() => expect(sockets).toHaveLength(1))

    // Fresh connection, nothing received yet — no resume to ask for (just the routine
    // viewing:null every hello/ping carries).
    sockets[0].emitMessage(helloFrame())
    expect(sockets[0].sent).toEqual([{ v: 1, type: 'viewing', ts: expect.any(String), data: { subject: null } }])

    // A chat.message frame carries an `id` — becomes the resume point for the NEXT connection.
    sockets[0].emitMessage({
      v: 1,
      type: 'chat.message',
      id: 'stream-42',
      ts: '2026-09-26T00:00:01Z',
      data: {
        thread: { type: 'lead', id: 'lead-1' },
        message: { id: 'm1', sender: 'student', content: 'hi', created_at: '2026-09-26T00:00:01Z' },
      },
    })

    // Drop and reconnect (1012 restart) — resume must be the very first frame sent, before viewing.
    sockets[0].emitClose(1012)
    await vi.advanceTimersByTimeAsync(0)
    await vi.waitFor(() => expect(sockets).toHaveLength(2))
    sockets[1].emitMessage(helloFrame())

    expect(sockets[1].sent[0]).toEqual({ v: 1, type: 'resume', ts: expect.any(String), data: { last_id: 'stream-42' } })
  })

  it('acknowledges chat.message with its frame id', async () => {
    const manager = makeManager()
    manager.start()
    await vi.waitFor(() => expect(sockets).toHaveLength(1))
    sockets[0].emitMessage(helloFrame())

    sockets[0].emitMessage({
      v: 1,
      type: 'chat.message',
      id: 'stream-7',
      ts: '2026-09-26T00:00:01Z',
      data: {
        thread: { type: 'lead', id: 'lead-1' },
        message: { id: 'm1', sender: 'student', content: 'hi', created_at: '2026-09-26T00:00:01Z' },
      },
    })

    expect(sockets[0].sent).toContainEqual({ v: 1, type: 'ack', ts: expect.any(String), data: { id: 'stream-7' } })
  })

  it('answers ping with pong', async () => {
    const manager = makeManager()
    manager.start()
    await vi.waitFor(() => expect(sockets).toHaveLength(1))
    sockets[0].emitMessage(helloFrame())
    sockets[0].sent.length = 0

    sockets[0].emitMessage({ v: 1, type: 'ping', id: null, ts: '2026-09-26T00:00:02Z', data: {} })

    expect(sockets[0].sent).toContainEqual({ v: 1, type: 'pong', ts: expect.any(String), data: {} })
  })

  it('ignores a frame whose type it does not recognise, without touching state', async () => {
    const manager = makeManager()
    manager.start()
    await vi.waitFor(() => expect(sockets).toHaveLength(1))
    sockets[0].emitMessage(helloFrame())
    sockets[0].sent.length = 0

    sockets[0].emitMessage({ v: 1, type: 'some.future.signal', id: 'z9', ts: '2026-09-26T00:00:03Z', data: { anything: true } })

    expect(sockets[0].sent).toEqual([]) // no ack, no pong — nothing sent back
    expect(manager.getStatus()).toBe('open') // no crash, no state change

    // And the ignored frame's id must NOT become the resume point either.
    sockets[0].emitClose(1012)
    await vi.advanceTimersByTimeAsync(0)
    await vi.waitFor(() => expect(sockets).toHaveLength(2))
    sockets[1].emitMessage(helloFrame())
    expect(sockets[1].sent).toEqual([{ v: 1, type: 'viewing', ts: expect.any(String), data: { subject: null } }]) // no resume — nothing was ever received to resume from
  })

  it('reconnects with full-jitter backoff doubling from 1s toward 30s on repeated failures', async () => {
    let callIndex = 0
    const randomSequence = [0.5, 0.25, 0.75] // deterministic multipliers for successive attempts
    fetchTicket = vi.fn(async (): Promise<TicketResult> => ({ ok: false, reason: 'error' }))
    const manager = makeManager({ random: () => randomSequence[callIndex++] ?? 1 })

    manager.start()
    await vi.waitFor(() => expect(fetchTicket).toHaveBeenCalledTimes(1))
    expect(manager.getStatus()).toBe('reconnecting')

    // attempt 0: ceiling = 1000ms, random 0.5 -> 500ms
    await vi.advanceTimersByTimeAsync(499)
    expect(fetchTicket).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(1)
    expect(fetchTicket).toHaveBeenCalledTimes(2)

    // attempt 1: ceiling = 2000ms, random 0.25 -> 500ms
    await vi.advanceTimersByTimeAsync(500)
    expect(fetchTicket).toHaveBeenCalledTimes(3)

    // attempt 2: ceiling = 4000ms, random 0.75 -> 3000ms
    await vi.advanceTimersByTimeAsync(2999)
    expect(fetchTicket).toHaveBeenCalledTimes(3)
    await vi.advanceTimersByTimeAsync(1)
    expect(fetchTicket).toHaveBeenCalledTimes(4)
  })

  it('resets the backoff attempt counter once hello is received again', async () => {
    const manager = makeManager()
    manager.start()
    await vi.waitFor(() => expect(sockets).toHaveLength(1))
    sockets[0].emitMessage(helloFrame())

    sockets[0].emitClose(1012)
    await vi.advanceTimersByTimeAsync(0) // attempt was 0 -> ceiling 1000 * random(0) = 0ms
    await vi.waitFor(() => expect(sockets).toHaveLength(2))
    sockets[1].emitMessage(helloFrame())

    // A second drop right after a fresh hello should again use attempt 0's (short) delay, not a
    // grown one — proof the counter was reset rather than kept climbing.
    sockets[1].emitClose(1012)
    await vi.advanceTimersByTimeAsync(0)
    await vi.waitFor(() => expect(sockets).toHaveLength(3))
  })

  it('falls back to polling on 503 realtime_disabled and retries after retry_after_s', async () => {
    fetchTicket = vi.fn(async (): Promise<TicketResult> => ({ ok: false, reason: 'disabled', retryAfterS: 45 }))
    const manager = makeManager()

    manager.start()
    await vi.waitFor(() => expect(fetchTicket).toHaveBeenCalledTimes(1))
    expect(manager.getStatus()).toBe('disabled')
    expect(useRealtimeStore.getState().disabledUntil).toBe(45_000)

    await vi.advanceTimersByTimeAsync(44_999)
    expect(fetchTicket).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(1)
    expect(fetchTicket).toHaveBeenCalledTimes(2)
  })

  it('takes a new ticket once on 4403, then falls back to disabled polling on a second one in a row', async () => {
    const manager = makeManager()
    manager.start()
    await vi.waitFor(() => expect(sockets).toHaveLength(1))
    sockets[0].emitMessage(helloFrame())

    sockets[0].emitClose(4403)
    await vi.waitFor(() => expect(fetchTicket).toHaveBeenCalledTimes(2)) // retried immediately, no backoff wait
    await vi.waitFor(() => expect(sockets).toHaveLength(2))
    // No hello this time — the ticket is rejected again right away.
    sockets[1].emitClose(4403)

    await vi.waitFor(() => expect(manager.getStatus()).toBe('disabled'))
    expect(fetchTicket).toHaveBeenCalledTimes(2) // no third attempt until the 60s retry fires
    await vi.advanceTimersByTimeAsync(60_000)
    expect(fetchTicket).toHaveBeenCalledTimes(3)
  })

  it('stops for good on 4401 (session ended) — no reconnect attempt follows', async () => {
    const manager = makeManager()
    manager.start()
    await vi.waitFor(() => expect(sockets).toHaveLength(1))
    sockets[0].emitMessage(helloFrame())

    sockets[0].emitClose(4401)
    expect(manager.getStatus()).toBe('stopped')

    await vi.advanceTimersByTimeAsync(120_000)
    expect(fetchTicket).toHaveBeenCalledTimes(1) // never retried on its own
  })

  it('reconnects on 1012 (server restart/drain)', async () => {
    const manager = makeManager()
    manager.start()
    await vi.waitFor(() => expect(sockets).toHaveLength(1))
    sockets[0].emitMessage(helloFrame())

    sockets[0].emitClose(1012)
    await vi.advanceTimersByTimeAsync(0)
    await vi.waitFor(() => expect(sockets).toHaveLength(2))
  })

  it('reconnects on 1000 (a 6th connection evicting this one)', async () => {
    const manager = makeManager()
    manager.start()
    await vi.waitFor(() => expect(sockets).toHaveLength(1))
    sockets[0].emitMessage(helloFrame())

    sockets[0].emitClose(1000)
    await vi.advanceTimersByTimeAsync(0)
    await vi.waitFor(() => expect(sockets).toHaveLength(2))
  })

  it('honours a `reconnect` frame\'s after_ms, then still redials when the NEW socket drops', async () => {
    const manager = makeManager()
    manager.start()
    await vi.waitFor(() => expect(sockets).toHaveLength(1))
    sockets[0].emitMessage(helloFrame())

    sockets[0].emitMessage({ v: 1, type: 'reconnect', id: null, ts: '2026-09-26T00:00:04Z', data: { after_ms: 5000 } })
    await vi.advanceTimersByTimeAsync(4999)
    expect(sockets).toHaveLength(1)
    await vi.advanceTimersByTimeAsync(1)
    await vi.waitFor(() => expect(sockets).toHaveLength(2)) // redialed by the reconnect frame's own timer
    sockets[1].emitMessage(helloFrame())
    expect(manager.getStatus()).toBe('open')

    // Any later drop of the replacement socket (Wi-Fi change, laptop sleep) is an ordinary close
    // and must be redialed — the "reconnect pending" flag must not have outlived its own timer.
    sockets[1].emitClose(1006)
    expect(manager.getStatus()).toBe('reconnecting') // polling resumes while we're not open
    await vi.advanceTimersByTimeAsync(0)
    await vi.waitFor(() => expect(sockets).toHaveLength(3))
  })

  it('does not double-schedule when the 1012 arrives before the `reconnect` frame\'s timer fires', async () => {
    const manager = makeManager()
    manager.start()
    await vi.waitFor(() => expect(sockets).toHaveLength(1))
    sockets[0].emitMessage(helloFrame())

    sockets[0].emitMessage({ v: 1, type: 'reconnect', id: null, ts: '2026-09-26T00:00:04Z', data: { after_ms: 5000 } })
    // Handlers are still attached here, so this close really reaches the manager.
    sockets[0].emitClose(1012)
    expect(manager.getStatus()).toBe('reconnecting') // no socket until the timer fires — poll meanwhile
    await vi.advanceTimersByTimeAsync(4999)
    expect(sockets).toHaveLength(1) // no backoff reconnect raced the frame's own timer
    await vi.advanceTimersByTimeAsync(1)
    await vi.waitFor(() => expect(sockets).toHaveLength(2))
    await vi.advanceTimersByTimeAsync(60_000)
    expect(sockets).toHaveLength(2) // exactly one redial
  })

  it('a `reconnect` frame cut short by stop() does not swallow the next session\'s first drop', async () => {
    const manager = makeManager()
    manager.start()
    await vi.waitFor(() => expect(sockets).toHaveLength(1))
    sockets[0].emitMessage(helloFrame())
    sockets[0].emitMessage({ v: 1, type: 'reconnect', id: null, ts: '2026-09-26T00:00:04Z', data: { after_ms: 5000 } })

    manager.stop()
    manager.start()
    await vi.waitFor(() => expect(sockets).toHaveLength(2))
    sockets[1].emitMessage(helloFrame())

    sockets[1].emitClose(1006)
    await vi.advanceTimersByTimeAsync(0)
    await vi.waitFor(() => expect(sockets).toHaveLength(3))
  })

  it('stop() closes the socket and cancels every pending timer', async () => {
    const manager = makeManager()
    manager.start()
    await vi.waitFor(() => expect(sockets).toHaveLength(1))
    sockets[0].emitMessage(helloFrame())

    manager.stop()
    expect(manager.getStatus()).toBe('stopped')
    expect(sockets[0].closed).toBe(true)

    await vi.advanceTimersByTimeAsync(120_000)
    expect(sockets).toHaveLength(1) // nothing reconnected after stop()
  })

  it('start() is idempotent — a second call while already running does nothing extra', async () => {
    const manager = makeManager()
    manager.start()
    manager.start()
    await vi.waitFor(() => expect(fetchTicket).toHaveBeenCalledTimes(1))
    expect(sockets).toHaveLength(1)
  })

  it('setViewing sends immediately when open, and is repeated on the next ping', async () => {
    const manager = makeManager()
    manager.start()
    await vi.waitFor(() => expect(sockets).toHaveLength(1))
    sockets[0].emitMessage(helloFrame())
    sockets[0].sent.length = 0

    manager.setViewing({ type: 'lead', id: 'lead-9' })
    expect(sockets[0].sent).toContainEqual({
      v: 1,
      type: 'viewing',
      ts: expect.any(String),
      data: { subject: { type: 'lead', id: 'lead-9' } },
    })

    sockets[0].sent.length = 0
    sockets[0].emitMessage({ v: 1, type: 'ping', id: null, ts: '2026-09-26T00:00:05Z', data: {} })
    expect(sockets[0].sent).toContainEqual(
      expect.objectContaining({ type: 'viewing', data: { subject: { type: 'lead', id: 'lead-9' } } }),
    )
  })

  it('does not connect at all when signed out', async () => {
    signedIn = false
    const manager = makeManager()
    manager.start()
    await vi.advanceTimersByTimeAsync(0)
    expect(fetchTicket).not.toHaveBeenCalled()
    expect(manager.getStatus()).toBe('stopped')
  })
})
