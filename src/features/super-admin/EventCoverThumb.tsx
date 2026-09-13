import { mediaUrl } from '@/lib/mediaUrl'

// A cover at a glance in the three events tables (2026-09-13), so "which of these has artwork?" is
// answerable without opening every row. A 16:9 box either way: an empty dashed slot reads as
// "none yet" — the app falls back to a plain colour card for those — rather than as a column that
// failed to load.
export function EventCoverThumb({ coverImageUrl }: { coverImageUrl?: string | null }) {
  const src = mediaUrl(coverImageUrl)
  if (!src) {
    return (
      <div
        role="img"
        aria-label="No cover"
        title="No cover"
        className="h-9 w-16 shrink-0 rounded-md border border-dashed border-border bg-background"
      />
    )
  }
  return (
    <img
      src={src}
      alt=""
      title="Has a cover"
      className="h-9 w-16 shrink-0 rounded-md border border-border bg-background object-cover"
    />
  )
}
