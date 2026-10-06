import { useState } from 'react'
import { UserPlus, type LucideIcon } from 'lucide-react'
import { Modal } from '@/components/Modal'
import { Button } from '@/components/Button'
import { StopPropagation } from '@/components/StopPropagation'
import { ServerSearchSelect } from '@/components/ServerSearchSelect'
import { activeEmployeeSource, employeeName, type Employee } from '@/queries/pickerSources'

interface AssignConsultantMenuProps {
  /** `name` is the chosen colleague's name, for the caller's confirmation message. */
  onSelect: (employeeId: string, name: string | undefined) => void
  /** Left out of the choices: the consultant who already holds the lead being reassigned. */
  excludeEmployeeId?: string | null
  label: string
  description?: string
  variant?: 'icon' | 'button'
  buttonText?: string
  disabled?: boolean
  // UserPlus means "give this to someone". Reassigning passes ArrowRightLeft instead, so moving a
  // lead between consultants doesn't read as allocating it (user, 2026-09-10).
  icon?: LucideIcon
}

// Shared "pick a consultant" popup — replaces a bare `<select>` both for the per-row Allocate
// action (icon trigger) and the bulk Allocate Selected action (labeled button trigger), so both
// share one consistent picker instead of two different affordances for the same choice. Opens as
// a centered `Modal` (user-requested, not an inline dropdown panel) with a one-line explanation,
// a picker to choose the consultant, and an explicit Confirm step — picking a name in the
// dropdown no longer allocates immediately, only Confirm does.
//
// The picker searches the roster on the server (review F-036, lane x): it used to be handed the
// first hundred employees, leavers included, so in a large consultancy the newest staff could not
// be chosen. Only people who work here now are offered.
export function AssignConsultantMenu({
  onSelect,
  excludeEmployeeId,
  label,
  description = 'Choose which consultant this should be allocated to.',
  variant = 'icon',
  buttonText,
  disabled,
  icon: Icon = UserPlus,
}: AssignConsultantMenuProps) {
  const [open, setOpen] = useState(false)
  const [choice, setChoice] = useState('')
  const [chosen, setChosen] = useState<Employee>()

  function openMenu() {
    setChoice('')
    setChosen(undefined)
    setOpen(true)
  }

  function handleConfirm() {
    if (!choice) return
    onSelect(choice, chosen ? employeeName(chosen) : undefined)
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
          <Icon className="h-4 w-4" />
        </button>
      ) : (
        <button
          type="button"
          onClick={openMenu}
          disabled={disabled}
          className="flex h-10 items-center gap-xs rounded-full bg-primary px-md text-button font-medium text-text-on-primary shadow-card hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Icon className="h-4 w-4" />
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
            <ServerSearchSelect
              id="assign-consultant"
              label="Consultant"
              required
              source={activeEmployeeSource}
              value={choice}
              onChange={(id, employee) => {
                setChoice(id)
                setChosen(employee)
              }}
              exclude={excludeEmployeeId ? (e) => e.id === excludeEmployeeId : undefined}
              placeholder="Search by name…"
              emptyText="No one matches that name."
            />
          </div>
        </Modal>
      )}
    </StopPropagation>
  )
}
