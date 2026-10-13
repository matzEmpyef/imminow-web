import { ApiError } from '@/api/errors'
import type { components } from '@/api/schema'

type ProposalStatus = components['schemas']['ConversionProposal']['status']
type ApplicantRequest = components['schemas']['ApplicantRequest']

/**
 * How a request to an existing student ended, in plain words, for the Clients page's "Recently
 * ended" list. Keyed by every proposal status so a status the contract gains later fails the
 * build here instead of rendering blank. `withdrawn` is a student taking back their own request;
 * a request the consultancy sent never reads it, but the word is here for the day one does.
 */
export const REQUEST_STATUS_LABEL: Record<ProposalStatus, string> = {
  pending: 'Waiting',
  approved: 'Accepted',
  declined: 'Declined',
  expired: 'Expired',
  cancelled: 'Cancelled',
  withdrawn: 'Withdrawn',
}

/**
 * What the lead page says about a conversion proposal that is no longer waiting (contract gate
 * 12f added `withdrawn` and `cancelled`). `pending` has its own controls there and no sentence.
 */
export const PROPOSAL_ENDED_LABEL: Record<Exclude<ProposalStatus, 'pending'>, string> = {
  approved: 'Accepted',
  declined: 'Declined',
  expired: 'Expired',
  withdrawn: 'The student withdrew their request',
  cancelled: 'Cancelled',
}

/**
 * The status a row of the requests list shows. A row whose typed details are gone belongs to an
 * erased account: it reads "Expired" whatever it was, so the list says nothing more about it.
 */
export function requestStatusLabel(request: Pick<ApplicantRequest, 'status' | 'requested'>): string {
  return request.requested ? REQUEST_STATUS_LABEL[request.status] : REQUEST_STATUS_LABEL.expired
}

/**
 * The line under "Request sent" when the server says few requests are left today. The server
 * sends `daily_limit` only then; with none there is no counter to show.
 */
export function dailyLimitLine(dailyLimit: ApplicantRequest['daily_limit']): string | null {
  if (!dailyLimit) return null
  const { remaining } = dailyLimit
  return `${remaining} ${remaining === 1 ? 'request' : 'requests'} to existing students left today. The limit resets tomorrow.`
}

export const TOO_MANY_ATTEMPTS_MESSAGE = 'Too many attempts. Please try again later.'

/**
 * What Create Applicant shows for a refusal. Only the rate limit gets the console's own words.
 * Everything else — a held email or phone (since Phase 8, D-119 C-7(2), the server's one neutral
 * sentence, the same whoever holds it), today's limit reached, asked too recently, the person has
 * already asked on the chat, the consultancy is suspended — is the server's own message, shown
 * exactly as served, which says what to do.
 */
export function createApplicantErrorMessage(err: Error): string {
  if (err instanceof ApiError) {
    if (err.status === 429 || err.code === 'rate_limited') return TOO_MANY_ATTEMPTS_MESSAGE
  }
  return err.message
}
