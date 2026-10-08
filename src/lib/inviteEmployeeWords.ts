import { ApiError } from '@/api/errors'

export const ALREADY_ON_TEAM_MESSAGE = 'That email is already on your team or has an invite waiting.'

/**
 * What Invite Employee shows for a refused invite. 409 `email_taken` now means ONE thing: the
 * address is already on this consultancy's own team, or has an invite of ours waiting (review
 * F-061). Whether it has an account anywhere else is never said by the server, and must never be
 * said here, so this refusal gets the console's own fixed words rather than whatever text arrives
 * with it. Everything else (the seat limit, a permission the inviter does not hold) is the
 * server's own message, which says what to do.
 */
export function inviteEmployeeErrorMessage(err: Error): string {
  if (err instanceof ApiError && err.code === 'email_taken') return ALREADY_ON_TEAM_MESSAGE
  return err.message
}
