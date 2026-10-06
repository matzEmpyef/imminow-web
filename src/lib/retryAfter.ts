import { ApiError } from '@/api/errors'

/**
 * The wait the server asked for, in whole seconds, from a refused request's
 * `details.retry_after_seconds` (the same number as its `Retry-After` header). Null when the
 * answer carries none, or it is not a positive number.
 */
export function retryAfterSeconds(error: unknown): number | null {
  const seconds = error instanceof ApiError ? error.details?.retry_after_seconds : undefined
  return typeof seconds === 'number' && Number.isFinite(seconds) && seconds > 0 ? Math.ceil(seconds) : null
}

/** A long wait in rough words: "about a minute", "about 5 minutes", "about 3 hours". */
export function aboutHowLong(seconds: number): string {
  const minutes = Math.ceil(seconds / 60)
  if (minutes <= 1) return 'about a minute'
  if (minutes < 120) return `about ${minutes} minutes`
  return `about ${Math.ceil(minutes / 60)} hours`
}

/** A short countdown as it ticks: "45s", "1m 05s". */
export function countdownText(seconds: number): string {
  const s = Math.max(0, Math.ceil(seconds))
  if (s < 60) return `${s}s`
  return `${Math.floor(s / 60)}m ${String(s % 60).padStart(2, '0')}s`
}
