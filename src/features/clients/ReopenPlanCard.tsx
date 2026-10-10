import { useState } from 'react'
import { Card } from '@/components/Card'
import { Button } from '@/components/Button'
import { TextField } from '@/components/TextField'
import { useReopenPlan } from '@/queries/clients'
import { showToast } from '@/lib/toast'
import { planReopenImpact } from '@/lib/reopenRules'

interface PlanLike {
  name?: string | null
  steps?: ReadonlyArray<{
    id?: string
    status?: string | null
    title?: string | null
    position?: number | null
  }> | null
}

/**
 * The Reopen Plan confirmation, for ONE plan (owner's ruling 2026-10-10: the most recently
 * completed step OF A PLAN is the only one that reopens; no picker). A case can run several plans
 * side by side, so the card is always given the plan it acts on and always sends that plan's step
 * id; the server then applies the rule inside that plan and leaves the others alone.
 *
 * `namePlan` is true when the case has several plans: the card then says which plan the step is in.
 * With a single plan the wording stays as it always was.
 */
export function ReopenPlanCard({
  clientId,
  plan,
  namePlan,
  onDone,
}: {
  clientId: string
  plan: PlanLike
  namePlan: boolean
  onDone: () => void
}) {
  const reopenPlan = useReopenPlan(clientId)
  const [reason, setReason] = useState('')
  const impact = planReopenImpact(plan)
  const planName = plan.name || 'this plan'

  return (
    <Card className="flex flex-col gap-sm">
      <div className="flex items-end gap-sm">
        <TextField
          label="Reason (mandatory)"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          className="flex-1"
        />
        <Button
          variant="destructive"
          disabled={!reason}
          loading={reopenPlan.isPending}
          onClick={() =>
            reopenPlan.mutate(
              { reason, stepId: impact?.reopened?.id },
              {
                onSuccess: () => {
                  showToast('Plan reopened')
                  setReason('')
                  onDone()
                },
              },
            )
          }
        >
          Confirm Reopen
        </Button>
      </div>
      {/* One rule, no picker (owner's ruling 2026-10-10): only the plan's most recently completed
          step is reopened, so the dialog names it, and the plan when there are several. */}
      {impact?.reopened && (
        <div className="flex flex-col gap-xs">
          <p className="text-body-sm text-text-primary">
            This reopens {impact.reopened.title}
            {namePlan ? ` in ${planName}` : ''}.
          </p>
          {impact.inProgress && (
            <p className="text-body-sm text-text-secondary">
              {impact.inProgress} will go back to waiting until {impact.reopened.title} is completed again. Its work
              is kept.
            </p>
          )}
          {namePlan && <p className="text-caption text-text-secondary">The case&rsquo;s other plans are not touched.</p>}
          <p className="text-caption text-text-secondary">To go further back, reopen one step at a time.</p>
        </div>
      )}
      {/* The server's own sentence, beside the button that was refused (review F-069): a plan is
          reopened only at a completed step (409 `conflict` otherwise). Another step may be in
          progress: it goes back to waiting, work kept, and the dialog says so first. */}
      {reopenPlan.isError && (
        <p role="alert" className="text-body-sm text-error">
          {reopenPlan.error.message}
        </p>
      )}
    </Card>
  )
}
