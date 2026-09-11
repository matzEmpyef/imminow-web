import { plural } from './format'
import type { components } from '@/api/schema'

type CaseSummary = components['schemas']['CaseSummary']

/** How far along the case was — carried over from the pre-rebuild DisputesPage, unchanged: the mediator needs this before deciding anything. */
export function CaseProgressChips({ progress }: { progress?: CaseSummary | null }) {
  if (!progress) {
    return <p className="text-body-sm text-text-secondary">No plan yet.</p>
  }
  return (
    <div className="flex flex-wrap gap-md rounded-md bg-background px-md py-sm text-caption text-text-secondary">
      <span>
        {progress.plan_progress ? `${progress.plan_progress} plan steps done` : 'No plan'}
        {(progress.plan_count ?? 0) > 1 && ` across ${progress.plan_count} plans`}
      </span>
      <span>{plural(progress.application_total, 'application')}</span>
      <span>{plural(progress.offers, 'offer')}</span>
      <span>{progress.accepted ?? 0} accepted</span>
      <span>{progress.rejected ?? 0} rejected</span>
    </div>
  )
}
