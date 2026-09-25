import { Button } from './Button'
import { countOf } from '@/lib/counts'

export interface CursorPagerProps {
  hasNext: boolean
  hasPrevious: boolean
  onNext: () => void
  onPrevious: () => void
  total?: number | null
  totalCapped?: boolean
  noun?: string
  /** Extra classes — e.g. negative margins to bleed the footer to a Card's own edge. */
  className?: string
}

/**
 * The same Previous/Next footer Table.tsx renders for its own `pagination` prop, factored out for
 * the handful of paged lists that aren't full tables (contract gate 7, Wave 3 plan §7 item 3 —
 * Internal Notes, Lead Notes, Activity and the Documents tab all used to read every page via the
 * temporary `fetchAllPages` helper). One look for "there's another page" everywhere in the
 * console, same as `useCursorPagination` (`src/lib/pagination.ts`) is the one cursor-bookkeeping
 * hook everywhere.
 */
export function CursorPager({
  hasNext,
  hasPrevious,
  onNext,
  onPrevious,
  total,
  totalCapped,
  noun = 'result',
  className = '',
}: CursorPagerProps) {
  if (!hasNext && !hasPrevious && total == null) return null
  return (
    <div className={`flex items-center justify-between border-t border-border px-md py-xs ${className}`}>
      <span className="text-caption text-text-secondary">{total != null ? countOf(total, totalCapped, noun) : ''}</span>
      {(hasNext || hasPrevious) && (
        <div className="flex gap-xs">
          <Button variant="secondary" size="sm" disabled={!hasPrevious} onClick={onPrevious}>
            Previous
          </Button>
          <Button variant="secondary" size="sm" disabled={!hasNext} onClick={onNext}>
            Next
          </Button>
        </div>
      )}
    </div>
  )
}
