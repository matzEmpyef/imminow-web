import { AlertTriangle } from 'lucide-react'
import { Button } from './Button'

/**
 * Shown inline wherever a PATCH answers 409 `version_conflict` (contract gate 7, optimistic
 * locking, BR §3.6, Wave 3 plan §7 item 4) — someone else saved this record first. The edit is
 * never silently overwritten: the only way past this notice is Reload, which re-reads the current
 * version before anyone edits again. One look everywhere it can happen (Plan Editor, Plan
 * Templates, Form Builder), same as every other shared notice in the console.
 */
export function VersionConflictNotice({ onReload }: { onReload: () => void }) {
  return (
    <div
      role="alert"
      className="flex flex-wrap items-center justify-between gap-sm rounded-md border border-error bg-error/10 px-md py-sm text-body-sm text-text-primary"
    >
      <span className="flex items-start gap-sm">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-error" aria-hidden />
        Someone else changed this — reload to see their changes.
      </span>
      <Button size="sm" variant="secondary" onClick={onReload}>
        Reload
      </Button>
    </div>
  )
}
