/** The uniform error envelope every endpoint returns — `openapi.yaml`'s `Error` schema. */
interface ApiErrorEnvelope {
  error?: { code?: string; message?: string; request_id?: string }
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

  constructor(fallback: string, body?: unknown) {
    const envelope = (body as ApiErrorEnvelope | undefined)?.error
    const message = envelope?.message?.trim()
    super(message && message.length > 0 ? message : fallback)
    this.name = 'ApiError'
    this.code = envelope?.code
    this.requestId = envelope?.request_id
  }
}
