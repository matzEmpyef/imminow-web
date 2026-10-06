import { Badge } from '@/components/Badge'

/** The two signals the server raises on a rating (and on the review written with it). */
export type RatingFlag = 'account_new' | 'single_consultancy'

const FLAG_LABEL: Record<RatingFlag, string> = {
  account_new: 'New account',
  single_consultancy: 'Only this consultancy',
}

/** What each signal means, for the tooltip. No day counts: the cut-off is a server setting. */
const FLAG_MEANING: Record<RatingFlag, string> = {
  account_new: 'The account was new when it rated.',
  single_consultancy: 'This account has never chatted or had a case with any other consultancy.',
}

/**
 * The signal badges, the same on the Ratings list, the rating drawer, and the review queue and
 * drawer (owner decision 16). A flag this build has never heard of is still shown, by its code,
 * rather than dropped: a signal nobody can see is worse than an oddly worded one.
 */
export function RatingFlagBadges({ flags }: { flags: readonly string[] | undefined | null }) {
  if (!flags || flags.length === 0) return null
  return (
    <span className="inline-flex flex-wrap items-center gap-xs">
      {flags.map((flag) => (
        <Badge key={flag} color="warning" title={FLAG_MEANING[flag as RatingFlag]}>
          {FLAG_LABEL[flag as RatingFlag] ?? flag.replace(/_/g, ' ')}
        </Badge>
      ))}
    </span>
  )
}
