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

  // ---- Review F-142: what the contract requires and the client left out -----------------------

  describe('a connection that goes silent', () => {
    it('is closed and redialled after 2.4 heartbeats without a frame', async () => {
      const manager = makeManager()
      manager.start()
      await vi.waitFor(() => expect(sockets).toHaveLength(1))
      sockets[0].emitMessage(helloFrame()) // heartbeat_s: 25

      await vi.advanceTimersByTimeAsync(59_000)
      expect(manager.getStatus()).toBe('open')
      expect(sockets).toHaveLength(1)

      // 60 seconds of nothing: the socket never closed, it just stopped speaking.
      await vi.advanceTimersByTimeAsync(1_000)
      expect(sockets[0].closed).toBe(true)
      expect(manager.getStatus()).not.toBe('open') // polling resumes
      await vi.waitFor(() => expect(sockets).toHaveLength(2))
    })

    it('is not mistaken for silence while pings keep arriving', async () => {
      const manager = makeManager()
      manager.start()
      await vi.waitFor(() => expect(sockets).toHaveLength(1))
      sockets[0].emitMessage(helloFrame())

      for (let i = 0; i < 10; i++) {
        await vi.advanceTimersByTimeAsync(25_000)
        sockets[0].emitMessage({ v: 1, type: 'ping', id: null, ts: '2026-09-26T00:00:00Z', data: {} })
      }
      expect(manager.getStatus()).toBe('open')
      expect(sockets).toHaveLength(1)
    })

    it("follows the server's own heartbeat when hello names a different one", async () => {
      const manager = makeManager()
      manager.start()
      await vi.waitFor(() => expect(sockets).toHaveLength(1))
      sockets[0].emitMessage({ ...helloFrame(), data: { heartbeat_s: 10, resume_id: null } })

      await vi.advanceTimersByTimeAsync(23_999)
      expect(sockets).toHaveLength(1)
      await vi.advanceTimersByTimeAsync(1)
      await vi.waitFor(() => expect(sockets).toHaveLength(2))
    })

    it('catches a socket that opens and never says hello', async () => {
      const manager = makeManager()
      manager.start()
      await vi.waitFor(() => expect(sockets).toHaveLength(1))
      await vi.advanceTimersByTimeAsync(60_000)
      await vi.waitFor(() => expect(sockets).toHaveLength(2))
    })
  })

  describe('a close with 4401 (session ended)', () => {
    async function openThenClose4401(refresh: () => Promise<{ kind: 'ok' | 'rejected' | 'unavailable' }>) {
      const onSessionEnded = vi.fn()
      const refreshSession = vi.fn(refresh)
      const manager = makeManager({ refreshSession, onSessionEnded })
      manager.start()
      await vi.waitFor(() => expect(sockets).toHaveLength(1))
      sockets[0].emitMessage(helloFrame())
      sockets[0].emitClose(4401)
      return { manager, refreshSession, onSessionEnded }
    }

    it('renews the session and reconnects with a new ticket', async () => {
      const { manager, refreshSession, onSessionEnded } = await openThenClose4401(async () => ({ kind: 'ok' }))
      await vi.waitFor(() => expect(sockets).toHaveLength(2))
      expect(refreshSession).toHaveBeenCalledTimes(1)
      expect(fetchTicket).toHaveBeenCalledTimes(2)
      sockets[1].emitMessage(helloFrame())
      expect(manager.getStatus()).toBe('open')
      expect(onSessionEnded).not.toHaveBeenCalled()
    })

    it('ends the session only when the server refuses the renewal', async () => {
      const { manager, onSessionEnded } = await openThenClose4401(async () => ({ kind: 'rejected' }))
      await vi.waitFor(() => expect(onSessionEnded).toHaveBeenCalledTimes(1))
      expect(manager.getStatus()).toBe('stopped')
      await vi.advanceTimersByTimeAsync(120_000)
      expect(fetchTicket).toHaveBeenCalledTimes(1)
    })

    it('tries again later, without ending anything, when the renewal could not be asked', async () => {
      const { manager, onSessionEnded } = await openThenClose4401(async () => ({ kind: 'unavailable' }))
      await vi.waitFor(() => expect(sockets).toHaveLength(2))
      expect(onSessionEnded).not.toHaveBeenCalled()
      expect(manager.getStatus()).not.toBe('stopped')
    })

    it('is not "open" while it recovers, so polling carries the threads meanwhile', async () => {
      let answer!: (result: { kind: 'ok' }) => void
      const { manager } = await openThenClose4401(() => new Promise((resolve) => (answer = resolve)))
      expect(manager.getStatus()).toBe('reconnecting')
      answer({ kind: 'ok' })
      await vi.waitFor(() => expect(sockets).toHaveLength(2))
    })

    it('still stops when it has no way to renew (no reconnect attempt follows)', async () => {
      const manager = makeManager()
      manager.start()
      await vi.waitFor(() => expect(sockets).toHaveLength(1))
      sockets[0].emitMessage(helloFrame())

      sockets[0].emitClose(4401)
      expect(manager.getStatus()).toBe('stopped')

      await vi.advanceTimersByTimeAsync(120_000)
      expect(fetchTicket).toHaveBeenCalledTimes(1) // never retried on its own
    })
  })

  describe('catching up', () => {
    const stale = (key: readonly unknown[]) => queryClient.getQueryState(key)?.isInvalidated
    function seedThreads() {
      for (const key of [
        ['conversations'],
        ['leads', 'lead-1', 'messages'],
        ['clients', 'client-5', 'messages'],
        ['internal-conversations', 'team', 'messages'],
      ]) {
        queryClient.setQueryData(key, { pages: [], pageParams: [] })
      }
    }
    const everyThreadIsStale = () =>
      [
        stale(['conversations']),
        stale(['leads', 'lead-1', 'messages']),
        stale(['clients', 'client-5', 'messages']),
        stale(['internal-conversations', 'team', 'messages']),
      ].every(Boolean)

    it('reads every open thread again on the first connect (nothing to resume from)', async () => {
      seedThreads()
      const manager = makeManager()
      manager.start()
      await vi.waitFor(() => expect(sockets).toHaveLength(1))
      expect(everyThreadIsStale()).toBe(false)
      sockets[0].emitMessage(helloFrame())
      expect(everyThreadIsStale()).toBe(true)
    })

    it('does not on a reconnect that resumes: the missed frames are replayed instead', async () => {
      const manager = makeManager()
      manager.start()
      await vi.waitFor(() => expect(sockets).toHaveLength(1))
      sockets[0].emitMessage(helloFrame())
      sockets[0].emitMessage({ v: 1, type: 'unread.changed', id: 'f-1', ts: '2026-09-26T00:00:00Z', data: { chat: 1 } })
      sockets[0].emitClose(1012)
      await vi.waitFor(() => expect(sockets).toHaveLength(2))

      seedThreads()
      sockets[1].emitMessage(helloFrame())
      expect(sockets[1].sent[0]).toMatchObject({ type: 'resume', data: { last_id: 'f-1' } })
      expect(everyThreadIsStale()).toBe(false)
    })

    it('reads every open thread again on a resync frame, not only the one being viewed', async () => {
      const manager = makeManager()
      manager.start()
      await vi.waitFor(() => expect(sockets).toHaveLength(1))
      sockets[0].emitMessage(helloFrame())
      seedThreads()
      manager.addViewing({ type: 'lead', id: 'lead-1' })

      sockets[0].emitMessage({ v: 1, type: 'resync', id: null, ts: '2026-09-26T00:00:00Z', data: {} })
      expect(everyThreadIsStale()).toBe(true)
    })
  })

  describe('threads on screen', () => {
    const viewingFrames = (socket: FakeSocket) =>
      socket.sent.filter((f) => (f as { type: string }).type === 'viewing').map((f) => (f as { data: unknown }).data)

    it('keeps the page thread as "viewing" when the floating window over it closes', async () => {
      const manager = makeManager()
      manager.start()
      await vi.waitFor(() => expect(sockets).toHaveLength(1))
      sockets[0].emitMessage(helloFrame())
      const page = { type: 'client' as const, id: 'client-5' }
      const floating = { type: 'lead' as const, id: 'lead-1' }

      manager.addViewing(page)
      manager.addViewing(floating)
      manager.removeViewing(floating)
      await vi.advanceTimersByTimeAsync(1_000)

      // It used to be one shared slot: closing the window sent `null` under the open page.
      expect(viewingFrames(sockets[0]).at(-1)).toEqual({ subject: page })
      manager.removeViewing(page)
      await vi.advanceTimersByTimeAsync(1_000)
      expect(viewingFrames(sockets[0]).at(-1)).toEqual({ subject: null })
    })
  })

  describe('stop()', () => {
    it('carries nothing of the session into the next one: no resume position, no viewing, no presence', async () => {
      const manager = makeManager()
      manager.start()
      await vi.waitFor(() => expect(sockets).toHaveLength(1))
      sockets[0].emitMessage(helloFrame())
      sockets[0].emitMessage({ v: 1, type: 'unread.changed', id: 'f-9', ts: '2026-09-26T00:00:00Z', data: { chat: 1 } })
      sockets[0].emitMessage({
        v: 1,
        type: 'presence',
        id: null,
        ts: '2026-09-26T00:00:00Z',
        data: { thread: { type: 'lead', id: 'lead-1' }, online: true },
      })
      manager.addViewing({ type: 'lead', id: 'lead-1' })
      expect(useRealtimeStore.getState().presenceByThread).toEqual({ 'lead:lead-1': true })

      manager.stop()
      expect(useRealtimeStore.getState().presenceByThread).toEqual({})

      manager.start()
      await vi.waitFor(() => expect(sockets).toHaveLength(2))
      sockets[1].emitMessage(helloFrame())
      await vi.advanceTimersByTimeAsync(1_000)
      const types = sockets[1].sent.map((f) => (f as { type: string }).type)
      expect(types).not.toContain('resume')
      expect(sockets[1].sent).toContainEqual(expect.objectContaining({ type: 'viewing', data: { subject: null } }))
    })

    it('does not send the previous socket\'s unsent frames on the next one', async () => {
      const manager = makeManager()
      manager.start()
      await vi.waitFor(() => expect(sockets).toHaveLength(1))
      sockets[0].emitMessage(helloFrame())
      // Three acks queue up (they are paced 110ms apart); the socket drops before they are sent.
      for (const id of ['m-1', 'm-2', 'm-3']) {
        sockets[0].emitMessage({
          v: 1,
          type: 'chat.message',
          id,
          ts: '2026-09-26T00:00:00Z',
          data: { thread: { type: 'lead', id: 'lead-1' }, message: { id, content: 'hi' } },
        })
      }
      sockets[0].emitClose(1006)
      await vi.waitFor(() => expect(sockets).toHaveLength(2))
      sockets[1].emitMessage(helloFrame())
      await vi.advanceTimersByTimeAsync(1_000)

      // `resume` is first, and no stale ack from the old socket comes before or after it.
      expect((sockets[1].sent[0] as { type: string }).type).toBe('resume')
      expect(sockets[1].sent.map((f) => (f as { type: string }).type)).not.toContain('ack')
    })
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
    sockets[1].emitMessage(helloFrame())
    // Under the 60 seconds of silence that would be a redial of its own (review F-142).
    await vi.advanceTimersByTimeAsync(50_000)
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

  it('falls back to polling, and retries much later, when the browser refuses to create the socket', async () => {
    // What a Content-Security-Policy without the wss origin does: the constructor itself throws.
    let refuse = true
    const manager = makeManager({
      wsFactory: () => {
        if (refuse) throw new DOMException('Refused to connect', 'SecurityError')
        const socket = new FakeSocket()
        sockets.push(socket)
        return socket
      },
    })

    manager.start()
    await vi.advanceTimersByTimeAsync(0) // let the ticket answer land; no time passes
    expect(fetchTicket).toHaveBeenCalledTimes(1)
    expect(manager.getStatus()).toBe('disabled') // not stuck in "connecting"
    expect(useRealtimeStore.getState().status).toBe('disabled')
    expect(useRealtimeStore.getState().disabledUntil).toBe(300_000)

    // No quick-retry loop of ticket requests while the fault stands.
    await vi.advanceTimersByTimeAsync(299_999)
    expect(fetchTicket).toHaveBeenCalledTimes(1)

    // And it recovers by itself if a later attempt is allowed.
    refuse = false
    await vi.advanceTimersByTimeAsync(1)
    await vi.waitFor(() => expect(sockets).toHaveLength(1))
    sockets[0].emitMessage(helloFrame())
    expect(manager.getStatus()).toBe('open')
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
