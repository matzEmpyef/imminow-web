// Split out of ClientProfilePage.tsx (Phase 3 plan, Tier B1, 2026-09-03).
// Reworked 2026-09-09: a case runs SEVERAL PLANS, all of one kind.
//
// The "Case plan" / "College plans" split this file carried for a day is gone (user: "There is no
// college plan, other plan or any other verity of plan. Just plan"). Every plan is the same thing.
//
// PLAN CARDS (user, 2026-09-10: "if there are multiple plans, it is difficult to understand there
// are multiple plans"). Plans used to be stacked accordion rows, one open at a time — the open
// plan's whole step builder landed between its row and the next, so the other plans sat a screen
// further down and read as part of that plan rather than plans of their own. They are now a row of
// cards above the builder: every plan visible at once, each with its progress, where it stands
// and whether anything waits on the consultant, and the selected one's steps below.
import { useState } from 'react'
import { CheckCircle2, CircleDot, ClipboardCheck } from 'lucide-react'
import { Card } from '@/components/Card'
import { Button } from '@/components/Button'
import { Badge } from '@/components/Badge'
import { AssignPlanModal } from '@/features/clients/AssignPlanModal'
import { PlanStepBuilder } from '@/features/clients/PlanStepBuilder'
import { ErrorState, Skeleton } from '@/components/QueryState'
import { usePlans } from '@/queries/plans'
import { usePermission } from '@/lib/permissions'
import type { components } from '@/api/schema'

type Plan = components['schemas']['Plan']

// Columns that the cards FILL (user, 2026-09-10: "What if there is four plans?"). A fixed three
// columns left a fourth plan alone on a row of its own. Two and three plans sit in one row; four
// sit in one row on a wide screen and 2×2 below that; five or more wrap three to a row.
function planGridColumns(count: number): string {
  if (count <= 2) return 'sm:grid-cols-2'
  if (count === 3) return 'sm:grid-cols-2 lg:grid-cols-3'
  if (count === 4) return 'sm:grid-cols-2 xl:grid-cols-4'
  return 'sm:grid-cols-2 lg:grid-cols-3'
}

/** What a plan card says about a plan, from its steps. */
function planStanding(plan: Plan) {
  const steps = [...plan.steps].sort((a, b) => a.position - b.position)
  const total = steps.length
  const done = steps.filter((s) => s.status === 'done').length
  const active = steps.find((s) => s.status === 'active')
  // A step the student has submitted and nobody has reviewed yet — the one thing on the card that
  // asks the consultant to act.
  const needsReview = steps.some((s) => s.status === 'active' && s.submitted_at)
  const where =
    total === 0
      ? 'No steps yet'
      : done === total
        ? 'All steps done'
        : active
          ? `Now: ${active.title}`
          : 'Not started'
  return { total, done, where, needsReview, complete: total > 0 && done === total }
}

function PlanCard({ plan, selected, onSelect }: { plan: Plan; selected: boolean; onSelect: () => void }) {
  const { total, done, where, needsReview, complete } = planStanding(plan)
  const pct = total ? Math.round((done / total) * 100) : 0
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={`flex min-w-0 flex-col gap-sm rounded-lg border p-md text-left transition-colors ${
        selected ? 'border-2 border-primary bg-primary/5 shadow-card' : 'border-border bg-surface hover:border-primary'
      }`}
    >
      <div className="flex items-start justify-between gap-sm">
        <span className="min-w-0 text-body font-medium text-text-primary">{plan.name}</span>
        {needsReview ? (
          <Badge color="warning" className="shrink-0 gap-xs">
            <ClipboardCheck className="h-3 w-3" aria-hidden />
            Needs review
          </Badge>
        ) : complete ? (
          <CheckCircle2 className="h-4 w-4 shrink-0 text-success" aria-label="Complete" />
        ) : null}
      </div>
      <div className="flex flex-col gap-xs">
        <div className="h-1.5 overflow-hidden rounded-full bg-background">
          <div className={`h-1.5 rounded-full ${complete ? 'bg-success' : 'bg-primary'}`} style={{ width: `${pct}%` }} />
        </div>
        <div className="flex items-center justify-between gap-sm text-caption">
          <span className="flex min-w-0 items-center gap-xs text-text-secondary">
            {!complete && total > 0 && <CircleDot className="h-3 w-3 shrink-0 text-primary" aria-hidden />}
            <span className="truncate">{where}</span>
          </span>
          <span className="shrink-0 tabular-nums text-text-secondary">
            {done} of {total} steps
          </span>
        </div>
      </div>
    </button>
  )
}

export function PlanTab({
  clientId,
  initialStepId,
  initialPlanId,
}: {
  clientId: string
  initialStepId?: string
  // The plan a consultant clicked on Overview. Without it, clicking the third plan there opened
  // the Plan tab on the first one, which reads as the click having done nothing.
  initialPlanId?: string
}) {
  const plans = usePlans(clientId)
  const [showAddPlan, setShowAddPlan] = useState(false)
  const canAssignTemplate = usePermission('clients.assign_template')
  // Which plan is shown. Deep-linking to a step (Activity's Step Approvals) opens whichever plan
  // holds it; otherwise the plan Overview pointed at, otherwise the first. One is always shown.
  const [selectedPlanId, setSelectedPlanId] = useState<string | null>(null)

  if (plans.isLoading) return <Skeleton className="h-24 rounded-lg" />
  if (plans.isError) return <ErrorState message="Could not load this case's plans." onRetry={() => plans.refetch()} />

  const items: Plan[] = plans.data?.items ?? []
  const summary = plans.data?.summary
  const deepLinkedPlan = initialStepId ? items.find((p) => p.steps.some((s) => s.id === initialStepId)) : undefined
  const selectedPlan =
    items.find((p) => p.id === selectedPlanId) ??
    deepLinkedPlan ??
    items.find((p) => p.id === initialPlanId) ??
    items[0] ??
    null
  const multiple = items.length > 1

  return (
    <div className="flex flex-col gap-lg">
      {/* Every step done and no college has answered. A long-lived state — the work for a college
          finishes long before the college decides — and one a wall of ticks reads as "finished"
          unless it is said outright. */}
      {summary?.waiting_on_colleges && (
        <Card className="border-l-4 border-l-warning">
          <p className="text-body font-medium text-text-primary">Everything is done. Waiting on the colleges.</p>
          <p className="text-body-sm text-text-secondary">
            Every step across every plan is complete. Nothing is outstanding on your side until a college replies.
          </p>
        </Card>
      )}

      <div className="flex items-baseline justify-between gap-md">
        <div>
          <h2 className="text-h3 text-text-primary">{multiple ? `${items.length} plans` : 'Plan'}</h2>
          {multiple && (
            <p className="text-body-sm text-text-secondary">
              This case runs its plans side by side. Pick one to see its steps.
            </p>
          )}
        </div>
        {/* No combined "x/y steps done overall" (user, 2026-09-10: "make no sense to show
            combined") — plans run side by side, so each card carries its own progress instead. */}
        {canAssignTemplate && items.length > 0 && (
          <Button variant="secondary" onClick={() => setShowAddPlan(true)}>
            Add a plan
          </Button>
        )}
      </div>

      {items.length === 0 ? (
        <Card className="flex items-center justify-between">
          <div>
            <p className="text-body text-text-secondary">No plan yet.</p>
            <p className="text-body-sm text-text-secondary">
              A case can run several side by side &mdash; documents, one per country, the visa &mdash; so the student
              works through them in parallel rather than one queue.
            </p>
          </div>
          {canAssignTemplate && <Button onClick={() => setShowAddPlan(true)}>Add a plan</Button>}
        </Card>
      ) : (
        <>
          {multiple && (
            <div className={`grid grid-cols-1 gap-md ${planGridColumns(items.length)}`} role="group" aria-label="Plans">
              {items.map((plan) => (
                <PlanCard
                  key={plan.id}
                  plan={plan}
                  selected={plan.id === selectedPlan?.id}
                  onSelect={() => setSelectedPlanId(plan.id)}
                />
              ))}
            </div>
          )}

          {selectedPlan && (
            <section className="flex flex-col gap-sm">
              {/* Names the plan the steps below belong to — with several plans, the one thing a
                  consultant must never have to guess. */}
              <div className="flex items-baseline justify-between gap-md border-b border-border pb-xs">
                <h3 className="text-body font-medium text-text-primary">
                  {multiple && <span className="text-text-secondary">Steps in </span>}
                  {selectedPlan.name}
                </h3>
                {selectedPlan.progress && (
                  <span className="text-body-sm tabular-nums text-text-secondary">{selectedPlan.progress} steps done</span>
                )}
              </div>
              {/* Keyed by plan: the builder picks its selected step once, on mount, so switching
                  plans must start it afresh rather than keep the previous plan's step selected. */}
              <PlanStepBuilder
                key={selectedPlan.id}
                clientId={clientId}
                plan={selectedPlan}
                initialStepId={deepLinkedPlan?.id === selectedPlan.id ? initialStepId : undefined}
              />
            </section>
          )}
        </>
      )}

      {showAddPlan && <AssignPlanModal clientId={clientId} onClose={() => setShowAddPlan(false)} />}
    </div>
  )
}
