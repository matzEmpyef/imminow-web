import { Lock, X } from 'lucide-react'
import { Badge } from '@/components/Badge'
import { Button } from '@/components/Button'
import { Drawer } from '@/components/Drawer'
import type { ShortlistEntry } from './courseFinderState'

interface CourseFinderNotesDrawerProps {
  open: boolean
  onClose: () => void
  /** "Notes — Priya Sharma" etc.; falls back to plain "Notes" with nobody selected. */
  personLabel: string | undefined
  shortlist: ShortlistEntry[]
  suggestedCourseIds: Set<string>
  suggestPending: boolean
  suggestingId: string | undefined
  onSuggest: (entry: { id: string; name: string }) => void
  onRemove: (courseId: string) => void
}

// The walk-through-on-a-call drawer (COURSES_MODULE_PLAN.md §4.1) — the consultant's working
// list for THIS applicant, kept on this device. Suggesting from here is the same commitment
// action as the table row; removing is one click. Extracted from CourseFinderPage's body in the
// 2026-08-25 decomposition pass.
export function CourseFinderNotesDrawer({
  open,
  onClose,
  personLabel,
  shortlist,
  suggestedCourseIds,
  suggestPending,
  suggestingId,
  onSuggest,
  onRemove,
}: CourseFinderNotesDrawerProps) {
  return (
    <Drawer
      open={open}
      onClose={onClose}
      title={personLabel ? `Notes — ${personLabel}` : 'Notes'}
      stickyContent={
        <p className="flex items-start gap-xs text-caption text-text-secondary">
          <Lock className="mt-0.5 h-3 w-3 shrink-0" />
          Internal only — a working list for this call. The applicant or lead never sees it; nothing here reaches them
          unless you tap Suggest.
        </p>
      }
    >
      {shortlist.length === 0 ? (
        <p className="px-lg py-md text-body-sm text-text-secondary">
          Nothing noted down yet — use the list icon on a result row to collect courses to walk through on a call.
        </p>
      ) : (
        <ul className="flex flex-col">
          {shortlist.map((entry) => (
            <li
              key={entry.course_id}
              className="flex items-center justify-between gap-sm border-b border-border px-lg py-md"
            >
              <div className="min-w-0">
                <p className="truncate font-medium text-text-primary">{entry.name}</p>
                <p className="truncate text-caption text-text-secondary">
                  {[entry.college_name, entry.country].filter(Boolean).join(' · ')}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-sm">
                {suggestedCourseIds.has(entry.course_id) ? (
                  <Badge color="secondary">Suggested</Badge>
                ) : (
                  <Button
                    variant="secondary"
                    onClick={() => onSuggest({ id: entry.course_id, name: entry.name })}
                    loading={suggestPending && suggestingId === entry.course_id}
                  >
                    Suggest
                  </Button>
                )}
                <button
                  type="button"
                  onClick={() => onRemove(entry.course_id)}
                  aria-label={`Remove ${entry.name} from notes`}
                  title="Remove"
                  className="flex h-9 w-9 items-center justify-center rounded-md text-text-secondary hover:bg-background hover:text-text-primary"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Drawer>
  )
}
