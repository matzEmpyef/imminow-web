/**
 * Scripted answers for a mocked `api.POST`, shared by the money-form tests: what the server says to
 * successive attempts of one write (a lost reply, a refusal, the "already recorded" answer, success).
 */
export type WriteAnswer =
  | { ok: true }
  | { networkError: true }
  | { status: number; code: string; message: string; details?: Record<string, unknown> }

/** The write went through on the first attempt and only its reply was lost (HTTP 409). */
export function alreadyApplied(code = 'conflict'): WriteAnswer {
  return {
    status: 409,
    code,
    message: 'This request was already applied.',
    details: { idempotency: 'already_applied', applied_at: '2026-10-06T09:00:00Z' },
  }
}

/** What `openapi-fetch` resolves (or the fetch failure it throws) for one scripted answer. */
export function resolveAnswer(answer: WriteAnswer, okData: unknown = { id: 'new' }) {
  if ('networkError' in answer) throw new TypeError('Failed to fetch')
  if ('ok' in answer) return { data: okData, error: undefined, response: { status: 201 } }
  return {
    data: undefined,
    error: { error: { code: answer.code, message: answer.message, request_id: 'r1', details: answer.details } },
    response: { status: answer.status },
  }
}

/** The `Idempotency-Key` header of one recorded `api.POST` call. */
export function sentKey(call: unknown[]): string {
  return (call[1] as { params: { header: { 'Idempotency-Key': string } } }).params.header['Idempotency-Key']
}
