import { useId, type ReactNode } from 'react'
import { Button } from './Button'
import { useListCeiling, type CeilingKind } from '@/lib/listCeilings'

// The create action of a list that has a ceiling (Tags, Designations, Branches — product owner,
// 2026-09-25), with the count against that ceiling underneath it: "12 of 100 tags". At the ceiling
// the button is disabled and the caption becomes the reason, so it says WHY rather than going dead
// (the same "disabled with a reason" rule VisitRequestDrawer and TagEditorMenu follow). One
// component for all three pages so they read the same way.
export function CeilingCreateButton({
  kind,
  count,
  onClick,
  children,
}: {
  kind: CeilingKind
  /** How many the list holds now — undefined while it loads (then no count and no ceiling). */
  count: number | undefined
  onClick: () => void
  children: ReactNode
}) {
  const ceiling = useListCeiling(kind, count)
  const captionId = useId()

  return (
    <div className="flex shrink-0 flex-col items-end gap-xs">
      <Button
        onClick={onClick}
        disabled={ceiling?.atLimit}
        title={ceiling?.reason}
        aria-describedby={ceiling ? captionId : undefined}
        className="inline-flex items-center gap-xs"
      >
        {children}
      </Button>
      {ceiling && (
        <p
          id={captionId}
          className={`text-caption tabular-nums ${ceiling.atLimit ? 'text-warning' : 'text-text-secondary'}`}
        >
          {ceiling.reason ?? ceiling.label}
        </p>
      )}
    </div>
  )
}
