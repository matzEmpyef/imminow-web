import { formatCount } from '@/lib/counts'

/**
 * How far a background job has got: a labelled bar with its percentage, and "1,200 of 4,000" when
 * the job counts its work. The numbers are the server's; a job that has not reported yet shows an
 * empty bar. Announced to a screen reader as a progress bar with the same label.
 */
export function ProgressBar({
  label,
  percent,
  done,
  total,
  noun = 'rows',
}: {
  label: string
  /** 0 to 100; anything outside is drawn at the nearest end. */
  percent: number
  done?: number | null
  total?: number | null
  /** What `done` and `total` count, plural. */
  noun?: string
}) {
  const value = Math.min(100, Math.max(0, Math.round(percent)))
  return (
    <div className="flex flex-col gap-xs">
      <div className="flex items-baseline justify-between gap-md">
        <p className="text-body-sm font-medium text-text-primary">{label}</p>
        <p className="text-body-sm text-text-secondary">{value}%</p>
      </div>
      <div
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={value}
        className="h-2 w-full overflow-hidden rounded-full bg-background"
      >
        <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${value}%` }} />
      </div>
      {typeof done === 'number' && typeof total === 'number' && total > 0 && (
        <p className="text-caption text-text-secondary">
          {formatCount(done)} of {formatCount(total)} {noun}
        </p>
      )}
    </div>
  )
}
