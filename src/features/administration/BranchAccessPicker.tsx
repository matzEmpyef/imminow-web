import { useId } from 'react'
import { toggleBranch, type BranchAccess } from './branchAccess'
import type { components } from '@/api/schema'

type Branch = components['schemas']['Branch']

/**
 * Branch coverage plus an explicit primary (product owner, 2026-09-21 — the invite and the edit
 * both take it, "to avoid the confusion of it being decided by tick order").
 *
 * The access modal used to print "(primary)" beside whichever branch happened to be first in
 * `branch_ids`; it was a LABEL for a decision nobody made, and that decision files every one of
 * this consultant's leads and clients — and their revenue — under a branch. So it is a control now.
 *
 * Radios beside the checkboxes rather than a separate "Primary branch" dropdown below them: the
 * choice is constrained to the rows already on screen, and a dropdown would have to repeat those
 * rows and then re-validate against them. A radio is disabled until its branch is ticked, which
 * states the constraint without having to write it out.
 */
export function BranchAccessPicker({
  branches,
  value,
  onChange,
  disabled,
  personLabel,
}: {
  branches: Branch[]
  value: BranchAccess
  onChange: (next: BranchAccess) => void
  disabled?: boolean
  /** Names the radio group for screen readers, e.g. "Priya Sharma". */
  personLabel: string
}) {
  const groupName = useId()
  const order = branches.map((b) => b.id!)

  return (
    <fieldset className="flex flex-col gap-xs" disabled={disabled}>
      <legend className="text-body-sm font-medium text-text-primary">Branches</legend>
      <div className="flex items-center justify-between gap-md pr-xs text-caption text-text-secondary">
        <span>Can work in</span>
        <span>Primary</span>
      </div>
      <div className="flex flex-col divide-y divide-border rounded-md border border-border">
        {branches.map((b) => {
          const covered = value.branchIds.includes(b.id!)
          return (
            <div key={b.id} className="flex items-center justify-between gap-md px-sm py-xs">
              <label className="flex flex-1 items-center gap-xs text-body-sm text-text-primary">
                <input
                  type="checkbox"
                  checked={covered}
                  onChange={() => onChange(toggleBranch(value, b.id!, order))}
                  className="h-4 w-4"
                />
                {b.name}
              </label>
              <input
                type="radio"
                name={groupName}
                aria-label={`Make ${b.name} the primary branch for ${personLabel}`}
                checked={covered && value.primaryId === b.id}
                disabled={!covered}
                onChange={() => onChange({ ...value, primaryId: b.id! })}
                className="h-4 w-4 disabled:opacity-40"
              />
            </div>
          )
        })}
      </div>
      <p className="text-caption text-text-secondary">
        The primary branch is where this person&rsquo;s leads and clients are filed &mdash; and so which branch their
        revenue counts towards. The others are branches they can see and work in. Changing it does not move cases
        already filed; it applies from the next one they are given.
      </p>
    </fieldset>
  )
}
