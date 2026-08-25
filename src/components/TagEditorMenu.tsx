import { useState } from 'react'
import { Tag as TagIcon, X } from 'lucide-react'
import { Modal } from './Modal'
import { Button } from './Button'
import { Combobox } from './Combobox'
import { StopPropagation } from './StopPropagation'

interface TagOption {
  id: string
  name: string
}

interface TagEditorMenuProps {
  tags: string[]
  catalog: TagOption[]
  onSave: (tags: string[]) => void
  onCreateTag: (name: string) => Promise<unknown>
  label: string
  saving?: boolean
}

// Shared "edit this record's tags" popup — a centered Modal (not an inline dropdown, matching
// AssignConsultantMenu.tsx's own pattern) showing the current tags as removable chips, a
// Combobox to add one (pick from the Tag Management catalog or type a new name — new names are
// created in the catalog on the fly, same "+ Add" idiom AddPhonebookContactModal's category
// field already uses), and an explicit Save that commits the whole array in one PATCH rather
// than round-tripping on every click.
export function TagEditorMenu({ tags, catalog, onSave, onCreateTag, label, saving }: TagEditorMenuProps) {
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState<string[]>(tags)
  const [picker, setPicker] = useState('')

  function openMenu() {
    setDraft(tags)
    setPicker('')
    setOpen(true)
  }

  async function addTag(name: string) {
    const trimmed = name.trim()
    if (!trimmed || draft.includes(trimmed)) {
      setPicker('')
      return
    }
    if (!catalog.some((t) => t.name === trimmed)) {
      await onCreateTag(trimmed)
    }
    setDraft((prev) => [...prev, trimmed])
    setPicker('')
  }

  function removeTag(name: string) {
    setDraft((prev) => prev.filter((t) => t !== name))
  }

  function handleSave() {
    onSave(draft)
    setOpen(false)
  }

  return (
    // Modal isn't a portal, so without StopPropagation, clicks (or Enter/Space, now that rows are
    // keyboard-activatable) anywhere inside the open popup bubble straight up through this cell
    // into the table row's own onClick and navigate away mid-edit.
    <StopPropagation>
      <button
        type="button"
        onClick={openMenu}
        aria-label={label}
        title={label}
        className="flex h-9 w-9 items-center justify-center rounded-md text-text-secondary hover:bg-background hover:text-text-primary"
      >
        <TagIcon className="h-4 w-4" />
      </button>

      {open && (
        <Modal
          onClose={() => setOpen(false)}
          title={label}
          widthRem={22}
          footer={
            <Button onClick={handleSave} loading={saving}>
              Save
            </Button>
          }
        >
          <div className="flex flex-col gap-md">
            <p className="text-body-sm text-text-secondary">Add or remove tags, then save.</p>

            <div className="flex flex-wrap gap-xs">
              {draft.length === 0 && <p className="text-body-sm text-text-secondary">No tags yet.</p>}
              {draft.map((t) => (
                <span
                  key={t}
                  className="flex items-center gap-xs rounded-full bg-background px-sm py-1 text-caption font-medium text-text-primary"
                >
                  {t}
                  <button
                    type="button"
                    onClick={() => removeTag(t)}
                    aria-label={`Remove ${t}`}
                    className="text-text-secondary hover:text-error"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </span>
              ))}
            </div>

            <Combobox
              label="Add a tag"
              value={picker}
              onChange={addTag}
              options={catalog.map((t) => t.name).filter((n) => !draft.includes(n))}
            />
          </div>
        </Modal>
      )}
    </StopPropagation>
  )
}
