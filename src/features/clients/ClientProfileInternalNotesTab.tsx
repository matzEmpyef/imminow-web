// Split out of ClientProfilePage.tsx (Phase 3 plan, Tier B1, 2026-09-03).
// Redesigned 2026-09-10 (user: "Improve UI of Internal notes"): each note carries its author's
// initials, name and when it was written; notes keep their line breaks; the composer grows with
// what is typed, Enter adds and Shift+Enter starts a new line.
//
// Still fills the available height (user-requested, 2026-08-19 — "internal notes.. let's make it
// cover full page.. add textbox and button at bottom"), with the list scrolling in the middle and
// the composer pinned at the bottom. Not chat bubbles: notes come from any team member, not a
// two-party exchange, so author-labelled rows read better here.
import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react'
import { NotebookPen, Send } from 'lucide-react'
import { Button } from '@/components/Button'
import { ErrorState, Skeleton } from '@/components/QueryState'
import { useAddInternalNote, useInternalNotes } from '@/queries/clients'
import { formatDateTime, relativeTime } from '@/lib/time'

function initials(first?: string | null, last?: string | null) {
  return `${(first ?? '').charAt(0)}${(last ?? '').charAt(0)}`.toUpperCase() || '?'
}

export function InternalNotesTab({ clientId }: { clientId: string }) {
  const notes = useInternalNotes(clientId)
  const addNote = useAddInternalNote(clientId)
  const [draft, setDraft] = useState('')
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // Grow with the text, up to about six lines, then scroll inside the box.
  useEffect(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`
  }, [draft])

  function submit(e?: FormEvent) {
    e?.preventDefault()
    if (!draft.trim()) return
    addNote.mutate(draft.trim(), { onSuccess: () => setDraft('') })
  }

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      submit()
    }
  }

  const items = notes.data ?? []

  return (
    <div className="flex h-[calc(100vh-16rem)] flex-col overflow-hidden rounded-lg border border-border bg-surface shadow-card">
      <div className="flex shrink-0 items-center justify-between gap-md border-b border-border px-lg py-sm">
        <div>
          <h2 className="text-h3 text-text-primary">Internal notes</h2>
          <p className="text-caption text-text-secondary">Visible to your team only. The student never sees these.</p>
        </div>
        {items.length > 0 && (
          <span className="text-body-sm tabular-nums text-text-secondary">
            {items.length} {items.length === 1 ? 'note' : 'notes'}
          </span>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-lg py-md">
        {notes.isLoading && <Skeleton className="h-16 rounded-lg" />}
        {notes.isError && <ErrorState message="Could not load notes." onRetry={() => notes.refetch()} />}
        {!notes.isLoading && !notes.isError && items.length === 0 && (
          <div className="flex h-full flex-col items-center justify-center gap-sm text-center">
            <NotebookPen className="h-8 w-8 text-text-secondary" aria-hidden />
            <p className="text-body-sm text-text-secondary">
              No notes yet. Write down anything the team should know about this case.
            </p>
          </div>
        )}
        <ul className="flex flex-col gap-md">
          {items.map((note) => (
            <li key={note.id} className="flex items-start gap-sm">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-caption font-semibold text-primary">
                {initials(note.author.first_name, note.author.last_name)}
              </span>
              <div className="min-w-0 flex-1 rounded-lg bg-background px-md py-sm">
                <p className="flex flex-wrap items-baseline gap-x-sm text-caption">
                  <span className="font-medium text-text-primary">
                    {note.author.first_name} {note.author.last_name}
                  </span>
                  <span className="text-text-secondary" title={formatDateTime(note.created_at)}>
                    {relativeTime(note.created_at)}
                  </span>
                </p>
                <p className="mt-xs whitespace-pre-wrap break-words text-body-sm text-text-primary">{note.content}</p>
              </div>
            </li>
          ))}
        </ul>
      </div>

      <form onSubmit={submit} className="flex shrink-0 items-end gap-sm border-t border-border px-lg py-md">
        <textarea
          ref={textareaRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={handleKeyDown}
          rows={1}
          aria-label="Add a note for the team"
          placeholder="Add a note for the team…  (Enter to add, Shift+Enter for a new line)"
          className="min-h-10 flex-1 resize-none rounded-md border border-border bg-background px-3 py-sm text-body text-text-primary outline-none focus:border-2 focus:border-primary"
        />
        <Button
          type="submit"
          loading={addNote.isPending}
          disabled={!draft.trim()}
          className="inline-flex shrink-0 items-center gap-xs"
        >
          <Send className="h-4 w-4" aria-hidden />
          Add note
        </Button>
      </form>
      {addNote.isError && <p className="px-lg pb-sm text-caption text-error">{addNote.error.message}</p>}
    </div>
  )
}
