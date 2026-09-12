import { Star } from 'lucide-react'

interface StarRatingProps {
  /** 1-5, may be fractional (a consultancy's averaged rating) — rendered rounded to the nearest star. */
  value: number
  size?: 'sm' | 'md'
}

// Shared ★ rendering (2026-09-12) — Reviews moderation and the read-only consultancy Reviews page
// both show a student's star rating, so this exists once rather than as two ad-hoc renderings
// that would drift (filled color, size) between the platform and consultancy consoles.
export function StarRating({ value, size = 'sm' }: StarRatingProps) {
  const iconClass = size === 'sm' ? 'h-3.5 w-3.5' : 'h-5 w-5'
  const rounded = Math.round(value)
  return (
    <span className="inline-flex items-center gap-xs" aria-label={`${value} out of 5 stars`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Star
          key={n}
          aria-hidden="true"
          className={`${iconClass} ${n <= rounded ? 'fill-warning text-warning' : 'text-border'}`}
        />
      ))}
    </span>
  )
}
