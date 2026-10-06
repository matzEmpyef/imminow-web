import { useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { Badge } from '@/components/Badge'
import { Button } from '@/components/Button'
import { Drawer } from '@/components/Drawer'
import { Modal } from '@/components/Modal'
import { StarRating } from '@/components/StarRating'
import { formatDate, formatDateTime } from '@/lib/time'
import { showToast } from '@/lib/toast'
import { useSetRatingExcluded, type AdminRating } from '@/queries/adminRatings'
import { ExcludeRatingModal } from './ExcludeRatingModal'
import { RatingFlagBadges } from './ratingShared'
import { channelLabel, formatStars } from './ratingWords'

const VIA_LABEL: Record<AdminRating['submissions_history'][number]['via'], string> = {
  chat: 'from chat',
  review: 'with a review',
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-xs">
      <p className="text-caption font-medium text-text-secondary">{title}</p>
      {children}
    </div>
  )
}

function plural(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`
}

/**
 * One student's rating of one consultancy, in full (owner decision 16): the averaged rating, each
 * submission behind it, the signals, and the two actions — "Exclude from score" and "Restore to
 * score". Same drawer-with-footer-actions shape as ReviewDrawer. Both actions are confirmed first:
 * each changes a consultancy's public score.
 */
export function RatingDrawer({
  rating,
  onClose,
  onUpdated,
}: {
  rating: AdminRating
  onClose: () => void
  onUpdated: (updated: AdminRating) => void
}) {
  const [excluding, setExcluding] = useState(false)
  const [restoring, setRestoring] = useState(false)
  const setExcluded = useSetRatingExcluded(rating.id)
  const student = rating.student_name ?? 'Erased account'
  const channel = channelLabel(rating.acquisition_source)

  function restore() {
    setExcluded.mutate(
      { excluded: false },
      {
        onSuccess: (updated) => {
          showToast(`Restored. ${rating.consultancy_name}’s score counts this rating again`)
          setRestoring(false)
          if (updated) onUpdated(updated)
        },
      },
    )
  }

  return (
    <Drawer open onClose={onClose} title={student} dismissible>
      <div className="flex flex-col gap-lg">
        <div className="flex flex-col gap-xs">
          <div className="flex flex-wrap items-center gap-sm">
            <span className="font-medium text-text-primary">{student}</span>
            {rating.excluded ? <Badge color="error">Excluded</Badge> : <Badge color="success">Included</Badge>}
          </div>
          <p className="text-caption text-text-secondary">
            {rating.student_account_created_at
              ? `Account created ${formatDate(rating.student_account_created_at)}`
              : 'This account was erased. The rating still counts unless it is excluded.'}
          </p>
        </div>

        <Section title="Consultancy">
          <Link
            to={`/admin/consultancies?search=${encodeURIComponent(rating.consultancy_name)}`}
            className="w-fit text-body-sm text-primary hover:underline"
          >
            {rating.consultancy_name}
          </Link>
          <p className="text-caption text-text-secondary">
            {rating.relationship === 'client' ? ['Client', channel].filter(Boolean).join(' · ') : 'Chat only, no case'}
          </p>
        </Section>

        <Section title="Rating">
          <div className="flex items-center gap-sm">
            <StarRating value={rating.stars} size="md" />
            <span className="text-body font-medium text-text-primary">{formatStars(rating.stars)}</span>
          </div>
          <p className="text-caption text-text-secondary">
            The average of {plural(rating.submissions, 'submission', 'submissions')}. Latest: {rating.last_stars}★ on{' '}
            {formatDate(rating.last_rated_at)}. First rated {formatDate(rating.first_rated_at)}.
          </p>
        </Section>

        <Section title="Signals">
          {rating.flags.length > 0 ? (
            <RatingFlagBadges flags={rating.flags} />
          ) : (
            <p className="text-body-sm text-text-secondary">None.</p>
          )}
          <ul className="flex flex-col gap-0.5 text-body-sm text-text-primary">
            <li>
              {rating.consultancy_name} asked for a rating {plural(rating.asked_count, 'time', 'times')}
            </li>
            <li>{plural(rating.consultancies_rated, 'consultancy', 'consultancies')} rated by this account</li>
          </ul>
        </Section>

        <Section title="Submissions">
          {rating.submissions_history.length === 0 ? (
            <p className="text-body-sm text-text-secondary">No submissions on record.</p>
          ) : (
            <ol className="flex flex-col divide-y divide-border rounded-md bg-background">
              {rating.submissions_history.map((s, index) => (
                <li key={`${s.rated_at}-${index}`} className="flex flex-col gap-0.5 px-sm py-xs">
                  <span className="text-body-sm text-text-primary">
                    {s.stars}★ {VIA_LABEL[s.via] ?? s.via} <span className="text-text-secondary">→</span> rating{' '}
                    {formatStars(s.stars_after)}
                  </span>
                  <span className="text-caption text-text-secondary">
                    {formatDateTime(s.rated_at)}
                    {s.account_age_days != null &&
                      ` · account was ${plural(s.account_age_days, 'day', 'days')} old`}
                  </span>
                </li>
              ))}
            </ol>
          )}
          {rating.submissions > rating.submissions_history.length && rating.submissions_history.length > 0 && (
            <p className="text-caption text-text-secondary">
              Showing the latest {rating.submissions_history.length} of {rating.submissions}.
            </p>
          )}
        </Section>

        {rating.review_id && (
          <Section title="Written review">
            <p className="text-body-sm text-text-primary">This student also wrote a review of this consultancy.</p>
            <Link to="/admin/reviews" className="w-fit text-body-sm text-primary hover:underline">
              Open Reviews
            </Link>
          </Section>
        )}

        {rating.excluded && (
          <div className="flex flex-col gap-xs rounded-md bg-background px-md py-sm">
            <p className="text-body-sm font-medium text-text-primary">Excluded from the score</p>
            <p className="text-caption text-text-secondary">
              {rating.excluded_by_name ?? 'Someone'}
              {rating.excluded_at ? ` · ${formatDateTime(rating.excluded_at)}` : ''}
            </p>
            {rating.excluded_reason && <p className="text-body-sm text-text-primary">Reason: {rating.excluded_reason}</p>}
            {rating.rated_again_since_exclusion && (
              <p className="text-body-sm text-warning">
                The student has rated again since. It stays excluded until you restore it.
              </p>
            )}
          </div>
        )}

        <div className="flex flex-wrap gap-sm pt-sm">
          {rating.excluded ? (
            <Button onClick={() => setRestoring(true)}>Restore to score</Button>
          ) : (
            <Button variant="destructive" onClick={() => setExcluding(true)}>
              Exclude from score
            </Button>
          )}
        </div>
      </div>

      {excluding && (
        <ExcludeRatingModal
          rating={rating}
          onClose={() => setExcluding(false)}
          onExcluded={(updated) => {
            onUpdated(updated)
            setExcluding(false)
          }}
        />
      )}

      {restoring && (
        <Modal
          onClose={() => setRestoring(false)}
          title="Restore this rating to the score?"
          widthRem={28}
          footer={
            <>
              {setExcluded.isError && (
                <p role="alert" className="mr-auto self-center text-body-sm text-error">
                  {setExcluded.error.message}
                </p>
              )}
              <Button variant="secondary" onClick={() => setRestoring(false)}>
                Cancel
              </Button>
              <Button loading={setExcluded.isPending} onClick={restore}>
                Restore to score
              </Button>
            </>
          }
        >
          <p className="text-body-sm text-text-secondary">
            The rating from <strong className="text-text-primary">{student}</strong> will count towards{' '}
            <strong className="text-text-primary">{rating.consultancy_name}</strong>&rsquo;s score again, at{' '}
            {formatStars(rating.stars)} stars. The score shown to students changes straight away.
          </p>
        </Modal>
      )}
    </Drawer>
  )
}
