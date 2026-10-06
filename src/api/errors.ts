/** The uniform error envelope every endpoint returns — `openapi.yaml`'s `Error` schema. */
interface ApiErrorEnvelope {
  error?: {
    code?: string
    message?: string
    request_id?: string
    details?: Record<string, unknown>
    /** Not in the contract: written in by `withErrorEnvelope` so the status travels with the body. */
    status?: number
  }
}

/**
 * The ONE place a bad response becomes an error the console can show (review F-149). The HTTP
 * client passes every answer through here before any caller sees it. An answer that is not a
 * success comes out as the contract's error envelope, always, with its HTTP status written into
 * it:
 *
 *   - the server's own envelope is kept as it is (code, message, request id, details);
 *   - an EMPTY body, a web page, or any other shape (what a gateway, a firewall or a host answers
 *     with during a deploy: 502, 504, 413) gets an envelope made for it, with the request id from
 *     the `X-Request-ID` header when there is one.
 *
 * Why it matters: the fetch library hands callers `error` as the parsed body, and every caller
 * tests `if (error)`. An empty body is an empty string, the test is false, and a save that never
 * happened was reported as saved by every form in the console. With the envelope guaranteed,
 * `if (error)` is true for every answer that is not a success, and the `ApiError` built from it
 * carries the status without each of the 400 call sites passing it.
 */
export async function withErrorEnvelope(response: Response): Promise<Response> {
  if (response.ok) return response
  let parsed: unknown
  try {
    parsed = JSON.parse(await response.clone().text())
  } catch {
    parsed = undefined
  }
  const body = parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : {}
  const given = body.error && typeof body.error === 'object' ? (body.error as Record<string, unknown>) : {}
  // FastAPI's own refusals (a route that never reached the application's handler) say `detail`.
  const detail = typeof body.detail === 'string' ? body.detail : ''
  const envelope = {
    ...body,
    error: {
      ...given,
      code: typeof given.code === 'string' && given.code ? given.code : `http_${response.status}`,
      message: typeof given.message === 'string' ? given.message : detail,
      request_id:
        typeof given.request_id === 'string' && given.request_id
          ? given.request_id
          : (response.headers.get('X-Request-ID') ?? undefined),
      status: response.status,
    },
  }
  const headers = new Headers(response.headers)
  headers.set('Content-Type', 'application/json')
  headers.delete('Content-Length')
  return new Response(JSON.stringify(envelope), { status: response.status, statusText: response.statusText, headers })
}

/**
 * Whether asking again could give a different answer (review F-149): no status at all (the
 * request never got an answer), too many requests, or a server-side failure such as the 502/503
 * of a deploy. Anything else is the server's considered answer — a 403 or a 404 says the same
 * thing however many times it is asked.
 */
export function isRetryable(error: unknown): boolean {
  if (!(error instanceof ApiError)) return true
  return error.status === undefined || error.status === 429 || error.status >= 500
}

/**
 * Carries the server's own explanation when there is one, falling back to the caller's generic
 * text when there isn't.
 *
 * Until 2026-08-25 this was a bare `class ApiError extends Error {}` and every call site threw a
 * hand-written string, discarding the response body. That mattered most exactly where the message
 * was most useful: the permission gates return copy like "Commission Details is limited to Admin
 * and Billing permission holders", and users saw "Could not load commission details" instead — a
 * denial indistinguishable from a network failure, with no hint whether to retry or ask an admin
 * for access.
 *
 * The fallback is kept rather than dropped: a 500 or a network failure has no useful `message`,
 * and "Could not load X" beats surfacing raw server text in those cases.
 *
 * Lives here (a leaf module, no imports) rather than in `queries/auth.ts` where it grew up, so
 * that `lib/queryClient.ts`'s retry policy can reference it without the import cycle
 * queries/auth → api/client → lib/session → lib/queryClient → queries/auth (N1 fix, 2026-09-01).
 * `queries/auth.ts` re-exports it, so existing imports keep working.
 */
export class ApiError extends Error {
  /** Machine-readable code, e.g. `forbidden` — for callers that branch on the reason. */
  readonly code?: string
  /** Correlates a user's report with the server log. */
  readonly requestId?: string
  /** Field-level/structured extras some codes carry — e.g. `in_use`'s `college_names` (2026-09-12). */
  readonly details?: Record<string, unknown>
  /**
   * The HTTP status of the answer. Every answer from the server carries it (`withErrorEnvelope`
   * writes it into the body the error is built from; a caller may also pass it). Missing only
   * when there was no answer at all: no connection, or the request timed out. Needed where 4xx
   * and 5xx must be told apart — an `Idempotency-Key` replays the stored answer to a refused
   * (4xx) write, but a 5xx is not stored — and by the retry rule (`isRetryable`).
   */
  readonly status?: number

  constructor(fallback: string, body?: unknown, status?: number) {
    const envelope = (body as ApiErrorEnvelope | undefined)?.error
    const message = envelope?.message?.trim()
    super(message && message.length > 0 ? message : fallback)
    this.name = 'ApiError'
    this.code = envelope?.code
    this.requestId = envelope?.request_id
    this.details = envelope?.details
    this.status = status ?? (typeof envelope?.status === 'number' ? envelope.status : undefined)
  }
}
