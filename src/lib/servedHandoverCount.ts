import { ApiError } from '@/api/errors'

/**
 * How many open items the server says still have to be handed over, from its 400
 * `reassignment_required` ("This employee still has 3 open items (leads, clients or tasks). Choose
 * who takes them over."); 0 for any other failure. The count covers leads, clients AND tasks (T4-21).
 */
export function servedHandoverCount(error: unknown): number {
  if (!(error instanceof ApiError) || error.code !== 'reassignment_required') return 0
  const count = error.details?.assigned_work_count
  return typeof count === 'number' && count > 0 ? count : 0
}
