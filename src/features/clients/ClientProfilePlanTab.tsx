// Split out of ClientProfilePage.tsx (Phase 3 plan, Tier B1, 2026-09-03).
// Reworked 2026-09-09 for plan scopes: a case runs one case plan plus one plan per college.
import { useState } from 'react'
import { Card } from '@/components/Card'
import { Button } from '@/components/Button'
import { AssignPlanModal } from '@/features/clients/AssignPlanModal'
import { PlanStepBuilder } from '@/features/clients/PlanStepBuilder'
import { ErrorState, Skeleton } from '@/components/QueryState'
import { usePlans } from '@/queries/plans'
import { usePermission } from '@/lib/permissions'

export function PlanTab({ clientId, initialStepId }: { clientId: string; initialStepId?: string }) {
  const plans = usePlans(clientId)
  const [showAssignCasePlan, setShowAssignCasePlan] = useState(false)
  const canAssignTemplate = usePermission('clients.assign_template')

  if (plans.isLoading) return <Skeleton className="h-24 rounded-lg" />
  if (plans.isError) return <ErrorState message="Could not load this case's plans." onRetry={() => plans.refetch()} />

  const items = plans.data?.items ?? []
  const summary = plans.data?.summary
  const casePlan = items.find((p) => p.scope === 'case')
  const applicationPlans = items.filter((p) => p.scope === 'application')

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

      <section className="flex flex-col gap-sm">
        <div className="flex items-baseline justify-between">
          <h2 className="text-h3 text-text-primary">Case plan</h2>
          <p className="text-body-sm text-text-secondary">
            Shared across every college — profile, documents, test prep.
          </p>
        </div>
        {casePlan ? (
          <PlanStepBuilder clientId={clientId} initialStepId={initialStepId} />
        ) : (
          <Card className="flex items-center justify-between">
            <p className="text-body text-text-secondary">No case plan assigned yet.</p>
            {canAssignTemplate && <Button onClick={() => setShowAssignCasePlan(true)}>Assign a Plan</Button>}
          </Card>
        )}
      </section>

      <section className="flex flex-col gap-sm">
        <div className="flex items-baseline justify-between">
          <h2 className="text-h3 text-text-primary">College plans</h2>
          <p className="text-body-sm text-text-secondary">
            {applicationPlans.length === 0
              ? 'Create one per college from the Applications tab.'
              : `${applicationPlans.length} running in parallel.`}
          </p>
        </div>
        {applicationPlans.length === 0 ? (
          <Card>
            <p className="text-body-sm text-text-secondary">
              Colleges with different procedures get their own plan, so a student applying to several isn&rsquo;t made to
              work through them one at a time. Add one from the Applications tab.
            </p>
          </Card>
        ) : (
          <div className="flex flex-col gap-sm">
            {applicationPlans.map((plan) => (
              <Card key={plan.id} className="flex items-center justify-between">
                <div>
                  <p className="text-body font-medium text-text-primary">
                    {plan.application?.course?.college_name ?? 'College'}
                  </p>
                  <p className="text-body-sm text-text-secondary">
                    {plan.application?.course?.name ?? 'Course'}
                    {plan.application?.status && (
                      <span> &middot; {plan.application.status.replace(/_/g, ' ')}</span>
                    )}
                  </p>
                </div>
                <p className="text-body-sm tabular-nums text-text-secondary">{plan.progress}</p>
              </Card>
            ))}
          </div>
        )}
      </section>

      {showAssignCasePlan && <AssignPlanModal clientId={clientId} onClose={() => setShowAssignCasePlan(false)} />}
    </div>
  )
}
