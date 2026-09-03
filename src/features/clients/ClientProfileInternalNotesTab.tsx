// Split out of ClientProfilePage.tsx (Phase 3 plan, Tier B1, 2026-09-03) — pure movement, no logic change.
import { useState, type FormEvent } from 'react'
import { Button } from '@/components/Button'
import { useAddInternalNote, useInternalNotes } from '@/queries/clients'
import { formatDateTime } from '@/lib/time'

// User-requested (2026-08-19) — "internal notes.. let's make it cover full page.. add textbox
// and button at bottom." Was a Card with the composer at the top and a short note list below;
// now fills the available height (same tall-panel feel Client/Lead Conversation already use,
// though not the ChatPanel component itself — notes come from any team member, not a two-party
// exchange, so plain author-labeled rows read better here than left/right chat bubbles), with the
// note list scrolling in the middle and the textbox + Add button pinned at the bottom.
export function InternalNotesTab({ clientId }: { clientId: string }) {
  const notes = useInternalNotes(clientId)
  const addNote = useAddInternalNote(clientId)
  const [draft, setDraft] = useState('')

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!draft.trim()) return
    addNote.mutate(draft, { onSuccess: () => setDraft('') })
  }

  return (
    <div className="flex h-[calc(100vh-16rem)] flex-col overflow-hidden rounded-lg border border-border bg-surface shadow-card">
      <div className="min-h-0 flex-1 overflow-y-auto px-lg py-md">
        {notes.data?.length === 0 && <p className="text-body-sm text-text-secondary">No notes yet.</p>}
        <div className="flex flex-col gap-sm">
          {notes.data?.map((note) => (
            <div key={note.id} className="border-b border-border pb-sm last:border-0">
              <p className="text-body-sm text-text-primary">{note.content}</p>
              <p className="text-caption text-text-secondary">
                {note.author.first_name} {note.author.last_name} · {formatDateTime(note.created_at)}
              </p>
            </div>
          ))}
        </div>
      </div>
      <form onSubmit={handleSubmit} className="flex shrink-0 items-center gap-sm border-t border-border px-lg py-md">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Add a note for the team…"
          className="h-10 flex-1 rounded-md border border-border bg-background px-3 text-body"
        />
        <Button type="submit" loading={addNote.isPending}>
          Add
        </Button>
      </form>
    </div>
  )
}
