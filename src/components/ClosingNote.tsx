/**
 * What the consultancy typed when it closed a case or a lead, shown on the closed page and in the
 * Reopen box (Phase 8 T4-17). Shown exactly as typed. Nothing is drawn when there is no note.
 */
export function ClosingNote({ note }: { note: string | null }) {
  if (!note) return null
  return (
    <div role="note" className="rounded-md border border-border bg-surface-muted px-md py-sm text-body-sm">
      <p className="font-medium text-text-primary">Closing note</p>
      <p className="whitespace-pre-wrap text-text-secondary">{note}</p>
    </div>
  )
}
