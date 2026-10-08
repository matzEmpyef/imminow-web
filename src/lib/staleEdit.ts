import { ApiError } from '@/api/errors'

/**
 * Stale edits (review F-075): the ONE helper for the records that send back the `version` they
 * were read at — reassigning a case, its branch and finalized country, the consultancy profile,
 * an employee, a course. When someone else saved the record first the server answers 409
 * `version_conflict` and writes nothing.
 *
 * A save hook uses it in two places:
 *
 *   - `editError(...)` where it would build an `ApiError`: a `version_conflict` comes out with
 *     the sentence below as its message, so every screen (an inline footer message or the global
 *     toast for a failed save) says the same thing without knowing about versions;
 *   - `reloadOnStaleEdit(err, reload)` in `onError`: the record is read again, so the next save
 *     carries the current version.
 *
 * The forms keep their own state, so what the person typed stays on screen while the record
 * behind it reloads. (The Plan Editor, Plan Templates and Form Builder, which rebuild the whole
 * screen from the record, keep their own `VersionConflictNotice` with a Reload button.)
 */
export const STALE_EDIT_NOTICE =
  'Someone else changed this while you were editing. We have loaded the latest version — please check and save again.'

/** True for the server's 409 `version_conflict`. */
export function isStaleEdit(err: unknown): boolean {
  return err instanceof ApiError && err.code === 'version_conflict'
}

/** `new ApiError(...)` for a versioned save: a `version_conflict` reads as {@link STALE_EDIT_NOTICE}. */
export function editError(fallback: string, body: unknown, status?: number): ApiError {
  const envelope = (body as { error?: { code?: string } } | undefined)?.error
  if (envelope?.code !== 'version_conflict') return new ApiError(fallback, body, status)
  return new ApiError(fallback, { error: { ...envelope, message: STALE_EDIT_NOTICE } }, status)
}

/** Reads the record again after a stale edit, and only then. */
export function reloadOnStaleEdit(err: unknown, reload: () => void): void {
  if (isStaleEdit(err)) reload()
}
