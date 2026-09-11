import { useState } from 'react'
import { Button } from '@/components/Button'
import { CompactSelect } from '@/components/CompactSelect'
import { TextAreaField } from '@/components/TextAreaField'
import { NOTE_OUTCOME_OPTIONS } from './labels'

/**
 * The "log what happened" form on the Complaints and Disputes drawers (2026-09-11) — a note plus
 * an optional outcome. Callers hide this entirely once the case is resolved (the server 409s a
 * note against a resolved record, so there is nothing useful for it to do there).
 */
export function AddNoteForm({
  onAdd,
  pending,
  errorMessage,
}: {
  onAdd: (note: string, outcome?: string) => void
  pending?: boolean
  errorMessage?: string
}) {
  const [note, setNote] = useState('')
  const [outcome, setOutcome] = useState('')

  function handleAdd() {
    if (!note.trim()) return
    onAdd(note.trim(), outcome || undefined)
    setNote('')
    setOutcome('')
  }

  return (
    <div className="flex flex-col gap-sm rounded-md border border-border p-sm">
      <TextAreaField
        label="Add a note"
        rows={3}
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="Who you spoke to and what they said."
      />
      <div className="flex items-center justify-between gap-sm">
        <CompactSelect label="Outcome" value={outcome} onChange={(e) => setOutcome(e.target.value)}>
          <option value="">No outcome</option>
          {NOTE_OUTCOME_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </CompactSelect>
        <Button size="sm" disabled={!note.trim()} loading={pending} onClick={handleAdd}>
          Add
        </Button>
      </div>
      {errorMessage && <p className="text-caption text-error">{errorMessage}</p>}
    </div>
  )
}
