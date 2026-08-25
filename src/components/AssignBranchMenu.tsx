import { useState } from 'react'
import { Building2 } from 'lucide-react'
import { Modal } from './Modal'
import { Button } from './Button'

interface BranchOption {
  id: string
  name: string
}

interface AssignBranchMenuProps {
  branches: BranchOption[]
  currentBranchId?: string | null
  onSelect: (branchId: string) => void
  label: string
  description?: string
  disabled?: boolean
  // Every other consumer sits in a table row, where an icon-only trigger is the compact, correct
  // choice. Lead Details' own "Branch" row already carries a text label right next to it, so a
  // second icon added nothing (user, 2026-08-24: "in Branch no need of icon") — `false` there
  // swaps in a plain "Change" text trigger instead. Defaults to the icon so every existing
  // consumer is unaffected.
  iconOnly?: boolean
}

// Mirrors AssignConsultantMenu.tsx exactly (same Modal + select + explicit Confirm shape, same
// `display: contents` + stopPropagation wrapper since Modal isn't a portal) — user-requested
// (2026-08-15) manual branch override, "just in case [the] consultant wants to change it" from
// whatever it was auto-stamped to on assignment. Build reference 1.15's "Branch scoping" note.
export function AssignBranchMenu({
  branches,
  currentBranchId,
  onSelect,
  label,
  description = 'Choose which branch this should be mapped to.',
  disabled,
  iconOnly = true,
}: AssignBranchMenuProps) {
  const [open, setOpen] = useState(false)
  const [choice, setChoice] = useState('')

  function openMenu() {
    setChoice(currentBranchId ?? '')
    setOpen(true)
  }

  function handleConfirm() {
    if (!choice) return
    onSelect(choice)
    setOpen(false)
  }

  return (
    <div className="contents">
      {iconOnly ? (
        <button
          type="button"
          onClick={openMenu}
          disabled={disabled}
          aria-label={label}
          title={label}
          className="flex h-9 w-9 items-center justify-center rounded-md text-text-secondary hover:bg-background hover:text-text-primary disabled:cursor-not-allowed disabled:opacity-40"
        >
          <Building2 className="h-4 w-4" />
        </button>
      ) : (
        <button
          type="button"
          onClick={openMenu}
          disabled={disabled}
          aria-label={label}
          className="text-body-sm text-primary hover:underline disabled:cursor-not-allowed disabled:opacity-40"
        >
          Change
        </button>
      )}

      {open && (
        <Modal
          onClose={() => setOpen(false)}
          title={label}
          widthRem={22}
          footer={
            <Button onClick={handleConfirm} disabled={!choice}>
              Confirm
            </Button>
          }
        >
          <div className="flex flex-col gap-md">
            <p className="text-body-sm text-text-secondary">{description}</p>
            <select
              value={choice}
              onChange={(e) => setChoice(e.target.value)}
              className="h-10 rounded-md border border-border bg-surface px-3 text-body"
            >
              <option value="" disabled>
                Select a branch…
              </option>
              {branches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </div>
        </Modal>
      )}
    </div>
  )
}
