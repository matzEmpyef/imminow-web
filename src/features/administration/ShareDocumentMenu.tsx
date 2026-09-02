import { useState } from 'react'
import { Share2 } from 'lucide-react'
import { Modal } from '@/components/Modal'
import { Button } from '@/components/Button'
import { SearchSelect } from '@/components/SearchSelect'

interface ClientOption {
  id: string
  name: string
}

interface ShareDocumentMenuProps {
  clients: ClientOption[]
  onSelect: (journeyId: string) => void
  label: string
  disabled?: boolean
}

// Mirrors AssignConsultantMenu.tsx exactly (Modal + select + explicit Confirm, `display: contents`
// + stopPropagation wrapper since Modal isn't a portal) — user-requested (2026-08-15) "share with
// an applicant" action for Document Library. Confirming copies the document into that applicant's
// own Documents tab (Client Profile), same as a consultant uploading it there directly.
export function ShareDocumentMenu({ clients, onSelect, label, disabled }: ShareDocumentMenuProps) {
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
    <div className="contents">
      <button
        type="button"
        onClick={openMenu}
        disabled={disabled}
        aria-label={label}
        title={label}
        className="flex h-9 w-9 items-center justify-center rounded-md text-text-secondary hover:bg-background hover:text-text-primary disabled:cursor-not-allowed disabled:opacity-40"
      >
        <Share2 className="h-4 w-4" />
      </button>

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
            <p className="text-body-sm text-text-secondary">
              Choose which applicant this document should be shared with. It'll be added to their own Documents tab.
            </p>
            <SearchSelect
              options={clients.map((c) => ({ id: c.id, label: c.name }))}
              value={choice}
              onChange={setChoice}
              placeholder="Search applicants…"
            />
          </div>
        </Modal>
      )}
    </div>
  )
}
