import { useState } from 'react'
import { UserPlus } from 'lucide-react'
import { Modal } from './Modal'
import { Button } from './Button'
import { StopPropagation } from './StopPropagation'

interface ConsultantOption {
  id: string
  name: string
}

interface AssignConsultantMenuProps {
  employees: ConsultantOption[]
  onSelect: (employeeId: string) => void
  label: string
  description?: string
  variant?: 'icon' | 'button'
  buttonText?: string
  disabled?: boolean
}

// Shared "pick a consultant" popup — replaces a bare `<select>` both for the per-row Allocate
// action (icon trigger) and the bulk Allocate Selected action (labeled button trigger), so both
// share one consistent picker instead of two different affordances for the same choice. Opens as
// a centered `Modal` (user-requested, not an inline dropdown panel) with a one-line explanation,
// a `<select>` to choose the consultant, and an explicit Confirm step — picking a name in the
// dropdown no longer allocates immediately, only Confirm does.
export function AssignConsultantMenu({
  employees,
  onSelect,
  label,
  description = 'Choose which consultant this should be allocated to.',
  variant = 'icon',
  buttonText,
  disabled,
}: AssignConsultantMenuProps) {
  const [open, setOpen] = useState(false)
  const [choice, setChoice] = useState('')

  function openMenu() {
    setChoice('')
    setOpen(true)
  }

  function handleConfirm() {
    if (!choice) return
    onSelect(choice)
    setOpen(false)
  }

  return (
    // Modal isn't a portal, so without StopPropagation, clicks anywhere inside the open popup
    // bubble straight up through this cell into the table row's own onClick (a real bug this
    // exact pattern hit on Active Leads' Tags column, TagEditorMenu.tsx — this component is
    // rendered into Active Leads' clickable rows too).
    <StopPropagation>
      {variant === 'icon' ? (
        <button
          type="button"
          onClick={openMenu}
          disabled={disabled}
          aria-label={label}
          title={label}
          className="flex h-9 w-9 items-center justify-center rounded-md text-text-secondary hover:bg-background hover:text-text-primary disabled:cursor-not-allowed disabled:opacity-40"
        >
          <UserPlus className="h-4 w-4" />
        </button>
      ) : (
        <button
          type="button"
          onClick={openMenu}
          disabled={disabled}
          className="flex h-10 items-center gap-xs rounded-full bg-primary px-4 text-button font-medium text-text-on-primary shadow-card hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <UserPlus className="h-4 w-4" />
          {buttonText ?? label}
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
                Select a consultant…
              </option>
              {employees.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.name}
                </option>
              ))}
            </select>
          </div>
        </Modal>
      )}
    </StopPropagation>
  )
}
