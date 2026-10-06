import { Button } from '@/components/Button'
import { formatDate } from '@/lib/time'
import type { components } from '@/api/schema'

type Lead = components['schemas']['Lead']

/** The one sentence a consultant sees when there has not been enough conversation. No number, ever. */
export const NOT_ENOUGH_CONVERSATION = 'Not enough conversation yet to ask for a rating'

/**
 * "Ask for rating" on a lead conversation (owner decision 16, review F-012).
 *
 * The server decides everything and says so on the lead: `can_request_rating`, and when that is
 * false, `rating_request_blocked_reason`. What "enough conversation" means is a hidden server
 * setting that is never sent to a client, so there is no count, no progress and no "x more
 * messages" here: only the fixed sentence.
 *
 *   may ask                 → the button
 *   not_enough_conversation → disabled, with the fixed sentence beneath
 *   asked_recently          → disabled "Rating requested recently", with "until {date}" only when
 *                             the server gave a date (it gives none when the consultancy has asked
 *                             this student as often as allowed)
 *   anything else           → disabled, nothing beneath (the server gave no reason to show)
 */
export function AskForRatingButton({
  lead,
  onAsk,
}: {
  lead: Pick<Lead, 'can_request_rating' | 'rating_request_blocked_reason' | 'rating_cooldown_ends_at'>
  onAsk: () => void
}) {
  const reason = lead.can_request_rating ? null : (lead.rating_request_blocked_reason ?? null)
  const askedRecently = reason === 'asked_recently'
  const caption =
    reason === 'not_enough_conversation'
      ? NOT_ENOUGH_CONVERSATION
      : askedRecently && lead.rating_cooldown_ends_at
        ? `until ${formatDate(lead.rating_cooldown_ends_at)}`
        : null

  return (
    <div className="flex flex-col items-center gap-0.5">
      <Button
        variant="secondary"
        disabled={!lead.can_request_rating}
        aria-describedby={caption ? 'ask-for-rating-caption' : undefined}
        onClick={onAsk}
      >
        {askedRecently ? 'Rating requested recently' : 'Ask for rating'}
      </Button>
      {caption && (
        <span id="ask-for-rating-caption" className="text-caption text-text-secondary">
          {caption}
        </span>
      )}
    </div>
  )
}
