import { Link } from 'react-router-dom'

/**
 * The line under a short list that shows only its first page (review F-298): a drawer or popup that
 * fetches one page and has no pager must say so, or it reads as the whole list.
 *
 * Shows nothing while the list is complete. "More" is the server's word: a `meta.next_cursor`, or a
 * `meta.total` above what is shown. `total` is optional because not every list carries one; the
 * line then says only that there are more. `to` points at the full list when one exists; `hint`
 * is for a list that can be narrowed instead (a search box above it).
 */
export function MoreRowsNote({
  shown,
  total,
  hasMore,
  noun,
  to,
  linkLabel,
  hint,
}: {
  shown: number
  /** The count across all pages, when the response carries one. */
  total?: number | null
  /** `meta.next_cursor` is set. */
  hasMore?: boolean
  /** Plural, e.g. "cases". */
  noun: string
  /** Where the full list lives. */
  to?: string
  linkLabel?: string
  /** Shown when there is no full list to link to, e.g. "Search to find the rest." */
  hint?: string
}) {
  const more = Boolean(hasMore) || (typeof total === 'number' && total > shown)
  if (!more) return null
  const count = typeof total === 'number' && total > shown ? `${shown} of ${total}` : `${shown}`
  return (
    <p className="text-caption text-text-secondary" role="note">
      Showing the first {count} {noun}.{' '}
      {to ? (
        <Link to={to} className="text-primary hover:underline">
          {linkLabel ?? 'See the full list'}
        </Link>
      ) : (
        hint
      )}
    </p>
  )
}
