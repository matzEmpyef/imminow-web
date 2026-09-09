// Split out of ClientProfilePage.tsx (Phase 3 plan, Tier B1, 2026-09-03).
// Reworked 2026-09-09: a case runs SEVERAL PLANS, all of one kind.
//
// The "Case plan" / "College plans" split this file carried for a day is gone (user: "There is no
// college plan, other plan or any other verity of plan. Just plan"). It made one plan privileged
// and rendered the rest as one-line college cards, which is why a profile with three plans read as
// a profile with one — the other two did not look like plans at all. Every plan is now the same
// thing in the same list, expandable to its own step builder.
import { useState } from 'react'
import { Card } from '@/components/Card'
import { Button } from '@/components/Button'
import { AssignPlanModal } from '@/features/clients/AssignPlanModal'
import { PlanStepBuilder } from '@/features/clients/PlanStepBuilder'
import { ErrorState, Skeleton } from '@/components/QueryState'
import { usePlans } from '@/queries/plans'
import { usePermission } from '@/lib/permissions'
import type { components } from '@/api/schema'

type Plan = components['schemas']['Plan']

export function PlanTab({ clientId, initialStepId }: { clientId: string; initialStepId?: string }) {
  const plans = usePlans(clientId)
  const [showAddPlan, setShowAddPlan] = useState(false)
  const canAssignTemplate = usePermission('clients.assign_template')
  // Which plan is open. Deep-linking to a step (Activity's Step Approvals) opens whichever plan
  // holds it; otherwise the first plan is open, because a case with one plan should not make the
  // consultant click to see it.
  const [openPlanId, setOpenPlanId] = useState<string | null>(null)

  if (plans.isLoading) return <Skeleton className="h-24 rounded-lg" />
  if (plans.isError) return <ErrorState message="Could not load this case's plans." onRetry={() => plans.refetch()} />

  const items: Plan[] = plans.data?.items ?? []
  const summary = plans.data?.summary
  const deepLinkedPlan = initialStepId
    ? items.find((p) => p.steps.some((s) => s.id === initialStepId))
    : undefined
  const activePlanId = openPlanId ?? deepLinkedPlan?.id ?? items[0]?.id ?? null

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

      <div className="flex items-baseline justify-between">
        <h2 className="text-h3 text-text-primary">
          {items.length === 1 ? 'Plan' : `Plans (${items.length})`}
        </h2>
        <div className="flex items-baseline gap-md">
          {summary?.plan_progress && (
            <p className="text-body-sm tabular-nums text-text-secondary">{summary.plan_progress} steps done</p>
          )}
          {canAssignTemplate && items.length > 0 && (
            <Button variant="secondary" onClick={() => setShowAddPlan(true)}>
              Add a plan
            </Button>
          )}
        </div>
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
        <div className="flex flex-col gap-md">
          {items.map((plan) => {
            const isOpen = plan.id === activePlanId
            return (
              <section key={plan.id} className="flex flex-col gap-sm">
                <button
                  type="button"
                  onClick={() => setOpenPlanId(isOpen ? null : plan.id)}
                  aria-expanded={isOpen}
                  className="flex items-center justify-between rounded-lg border border-border bg-surface px-md py-sm text-left hover:border-primary"
                >
                  <span className="text-body font-medium text-text-primary">{plan.name}</span>
                  <span className="text-body-sm tabular-nums text-text-secondary">{plan.progress}</span>
                </button>
                {isOpen && (
                  <PlanStepBuilder
                    clientId={clientId}
                    plan={plan}
                    initialStepId={deepLinkedPlan?.id === plan.id ? initialStepId : undefined}
                  />
                )}
              </section>
            )
          })}
        </div>
      )}

      {showAddPlan && <AssignPlanModal clientId={clientId} onClose={() => setShowAddPlan(false)} />}
    </div>
  )
}
