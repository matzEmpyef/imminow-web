// Split out of ClientProfilePage.tsx (Phase 3 plan, Tier B1, 2026-09-03) — pure movement, no logic change.
import { useState } from 'react'
import { Card } from '@/components/Card'
import { Button } from '@/components/Button'
import { AssignPlanModal } from '@/features/clients/AssignPlanModal'
import { PlanStepBuilder } from '@/features/clients/PlanStepBuilder'
import { ErrorState, Skeleton } from '@/components/QueryState'
import { ApiError } from '@/api/errors'
import { usePlan } from '@/queries/plans'
import { usePermission } from '@/lib/permissions'

export function PlanTab({ clientId, initialStepId }: { clientId: string; initialStepId?: string }) {
  const plan = usePlan(clientId)
  const [showAssignPlan, setShowAssignPlan] = useState(false)
  const canAssignTemplate = usePermission('clients.assign_template')
  if (plan.isLoading) return <Skeleton className="h-24 rounded-lg" />
  // T4 (third-pass review): only the documented no-plan 404 is the empty state. Any OTHER
  // failure (500, 403) used to render "No plan assigned yet." + Assign on a client who HAS a
  // plan — inviting a second assignment instead of a retry.
  const isNoPlanYet = plan.error instanceof ApiError && plan.error.code === 'not_found'
  if (plan.isError && !isNoPlanYet) {
    return <ErrorState message="Could not load the plan." onRetry={() => plan.refetch()} />
  }
  if (plan.isError || !plan.data) {
    return (
      <>
        <Card className="flex items-center justify-between">
          <p className="text-body text-text-secondary">No plan assigned yet.</p>
          {canAssignTemplate && <Button onClick={() => setShowAssignPlan(true)}>Assign a Plan</Button>}
        </Card>
        {showAssignPlan && <AssignPlanModal clientId={clientId} onClose={() => setShowAssignPlan(false)} />}
      </>
    )
  }
  return <PlanStepBuilder clientId={clientId} initialStepId={initialStepId} />
}
