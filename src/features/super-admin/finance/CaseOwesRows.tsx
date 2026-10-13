import type { components } from '@/api/schema'
import { money } from './money'

type Money = components['schemas']['Money']

/**
 * WHAT A CASE STILL OWES, AS TWO FIGURES (Phase 8 T1-04). The receive, confirm and correct boxes
 * used to say one thing, "Outstanding on this case", and it was two amounts at once: what has
 * fallen due and what is not yet due (college money not yet received). Every other Finance screen
 * calls only the first "outstanding", so the box disagreed with the drawer.
 *
 * Both figures, and the rupee value of each, are the server's (`due_now`, `still_to_come` and their
 * `_inr` companions on the previews). Nothing is added or subtracted here, and a rupee value that
 * was not served is not shown. The second line is left out when nothing is still to come.
 */
export function CaseOwesRows({
  dueNow,
  dueNowInr,
  stillToCome,
  stillToComeInr,
}: {
  /** Fallen due and unpaid. Null while only the list's figure is missing: reads "Not known". */
  dueNow: Money | null | undefined
  dueNowInr?: Money | null
  stillToCome?: Money | null
  stillToComeInr?: Money | null
}) {
  const hasStillToCome = stillToCome?.amount != null && stillToCome.amount > 0
  return (
    <>
      <OwesRow label="Due now" value={dueNow} inrValue={dueNowInr} />
      {hasStillToCome && <OwesRow label="Still to come when the college pays" value={stillToCome} inrValue={stillToComeInr} />}
    </>
  )
}

function OwesRow({ label, value, inrValue }: { label: string; value: Money | null | undefined; inrValue?: Money | null }) {
  // The rupee value only stands beside a figure in another currency; a rupee figure is its own.
  const showInr = value != null && value.currency !== 'INR' && inrValue?.amount != null
  return (
    <div className="flex items-center justify-between gap-sm">
      <span className="text-caption text-text-secondary">{label}</span>
      <span className="flex flex-col items-end">
        <span className="text-body-sm text-text-primary">{value ? money(value) : 'Not known'}</span>
        {showInr && <span className="text-caption text-text-secondary">≈ {money(inrValue)}</span>}
      </span>
    </div>
  )
}
