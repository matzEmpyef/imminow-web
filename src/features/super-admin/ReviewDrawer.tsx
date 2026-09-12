import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Badge } from '@/components/Badge'
import { Button } from '@/components/Button'
import { Drawer } from '@/components/Drawer'
import { StarRating } from '@/components/StarRating'
import { formatDateTime } from '@/lib/time'
import { showToast } from '@/lib/toast'
import { useModerateReview, type Review } from '@/queries/adminReviews'
import { HideReviewModal } from './HideReviewModal'

const STATUS_META: Record<Review['status'], { label: string; color: 'warning' | 'success' | 'secondary' }> = {
  pending: { label: 'Pending', color: 'warning' },
  published: { label: 'Published', color: 'success' },
  hidden: { label: 'Hidden', color: 'secondary' },
}

/**
 * The full review record (2026-09-12) — same drawer-with-footer-actions shape as
 * ComplaintDrawer.tsx. Pending gets both actions (Publish, Hide); Published only Hide; Hidden only
 * Publish again — mirrored from PATCH /admin/reviews/{id}'s own doc comment ("a hidden review can
 * be published again").
 */
export function ReviewDrawer({
  review,
  onClose,
  onUpdated,
}: {
  review: Review
  onClose: () => void
  onUpdated: (updated: Review) => void
}) {
  const [hiding, setHiding] = useState(false)
  const moderate = useModerateReview(review.id)
  const statusMeta = STATUS_META[review.status]

  function publish() {
    moderate.mutate(
      { status: 'published' },
      {
        onSuccess: (updated) => {
          showToast('Published — now visible in the app')
          if (updated) onUpdated(updated)
        },
      },
    )
  }

  return (
    <Drawer open onClose={onClose} title={review.student_name} dismissible>
      <div className="flex flex-col gap-lg">
        <div className="flex flex-wrap items-center gap-sm">
          <span className="font-medium text-text-primary">{review.student_name}</span>
          <Badge color={statusMeta.color}>{statusMeta.label}</Badge>
        </div>
        <p className="text-caption text-text-secondary">
          {[review.study_level, review.target_country].filter(Boolean).join(' · ') || 'No plan details on file'}
        </p>

        <div className="flex flex-col gap-xs">
          <p className="text-caption font-medium text-text-secondary">Consultancy</p>
          {review.consultancy_name ? (
            <Link
              to={`/admin/consultancies?search=${encodeURIComponent(review.consultancy_name)}`}
              className="w-fit text-body-sm text-primary hover:underline"
            >
              {review.consultancy_name}
            </Link>
          ) : (
            <span className="text-body-sm text-text-secondary">—</span>
          )}
        </div>

        <div className="flex flex-col gap-xs">
          <p className="text-caption font-medium text-text-secondary">Rating</p>
          <StarRating value={review.stars} size="md" />
        </div>

        <div className="flex flex-col gap-xs">
          <p className="text-caption font-medium text-text-secondary">Review</p>
          <p className="whitespace-pre-wrap rounded-md bg-background p-sm text-body-sm text-text-primary">
            {review.text}
          </p>
          <p className="text-caption text-text-secondary">Submitted {formatDateTime(review.created_at)}</p>
        </div>

        {review.moderated_at && (
          <div className="flex flex-col gap-xs rounded-md bg-background px-md py-sm">
            <p className="text-body-sm font-medium text-text-primary">
              {review.status === 'hidden' ? 'Hidden' : 'Published'}
            </p>
            <p className="text-caption text-text-secondary">
              {review.moderated_by_name ?? 'Someone'} · {formatDateTime(review.moderated_at)}
            </p>
            {review.status === 'hidden' && review.hidden_reason && (
              <p className="text-body-sm text-text-primary">Reason: {review.hidden_reason}</p>
            )}
          </div>
        )}

        {moderate.isError && <p className="text-body-sm text-error">{moderate.error.message}</p>}

        <div className="flex flex-wrap gap-sm pt-sm">
          {review.status !== 'published' && (
            <Button loading={moderate.isPending} onClick={publish}>
              {review.status === 'hidden' ? 'Publish again' : 'Publish'}
            </Button>
          )}
          {review.status !== 'hidden' && (
            <Button variant="secondary" onClick={() => setHiding(true)}>
              Hide
            </Button>
          )}
        </div>
      </div>

      {hiding && (
        <HideReviewModal
          review={review}
          onClose={() => setHiding(false)}
          onHidden={(updated) => {
            onUpdated(updated)
            setHiding(false)
          }}
        />
      )}
    </Drawer>
  )
}
