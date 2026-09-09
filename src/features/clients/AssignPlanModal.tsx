import { useState } from 'react'
import { Modal } from '@/components/Modal'
import { Button } from '@/components/Button'
import { Card } from '@/components/Card'
import { ErrorState, Skeleton } from '@/components/QueryState'
import { useAssignPlan, usePlanTemplates } from '@/queries/plans'

// User-requested (2026-08-15) — "let consultant assign a plan in Overview tab itself. on button
// click a popup appears to select the plan." Was a standalone page (AssignPlanPage.tsx,
// /clients/:id/assign-plan) reached only from Plan tab's own "no plan yet" state — folded into a
// popup so both Overview and Plan tab can trigger the same flow inline, same move this session
// already made for Create Applicant/Add Lead/etc.
/**
 * Since 2026-09-09 a plan belongs to a scope. Opened with no `application`, this assigns the CASE
 * plan — the one plan per case holding everything shared across every college, and what every
 * caller predating scopes meant. Opened WITH an application, it assigns that college's own plan,
 * so a student applying to four colleges gets four parallel plans instead of one queue pretending
 * the four are sequential.
 */
export function AssignPlanModal({
  clientId,
  application,
  onClose,
}: {
  clientId: string
  application?: { id: string; collegeName: string }
  onClose: () => void
}) {
  const templates = usePlanTemplates()
  const assignPlan = useAssignPlan(clientId)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  // T8: one key per modal open — double-clicking Assign is one operation.
  const [idempotencyKey] = useState(() => crypto.randomUUID())

  const selected = templates.data?.find((t) => t.id === selectedId)

  return (
    <Modal
      onClose={onClose}
      title={application ? `Plan for ${application.collegeName}` : 'Assign the Case Plan'}
      widthRem={36}
      footer={
        <>
          {assignPlan.isError && (
            <p className="mr-auto self-center text-body-sm text-error">{assignPlan.error.message}</p>
          )}
          <Button
            loading={assignPlan.isPending}
            disabled={!selected}
            onClick={() =>
              selected &&
              !assignPlan.isPending &&
              assignPlan.mutate(
                {
                  templateId: selected.id,
                  idempotencyKey,
                  scope: application ? 'application' : 'case',
                  ...(application ? { applicationId: application.id } : {}),
                },
                { onSuccess: onClose },
              )
            }
          >
            Assign This Plan
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-md">
        <p className="text-body-sm text-text-secondary">
          {application ? (
            <>
              Steps for this college&rsquo;s own procedure — its form, its fee, its interview. Anything shared across
              every college belongs on the case plan instead, so the student is only asked once.
            </>
          ) : (
            <>
              The one plan per case: profile, documents, test prep — everything shared across every college the student
              applies to. Each college gets its own plan from the Applications tab.
            </>
          )}
        </p>
        {templates.isLoading && <Skeleton className="h-40 rounded-lg" />}
        {templates.isError && (
          <ErrorState message="Could not load plan templates." onRetry={() => templates.refetch()} />
        )}

        <div className="grid grid-cols-2 gap-md">
          {templates.data?.map((template) => (
            <Card
              key={template.id}
              onClick={() => setSelectedId(template.id)}
              className={`cursor-pointer ${selectedId === template.id ? 'ring-2 ring-primary' : ''}`}
            >
              <p className="text-body font-medium text-text-primary">{template.name}</p>
              <p className="text-caption text-text-secondary">{template.steps.length} steps</p>
            </Card>
          ))}
        </div>

        {selected && (
          <div className="rounded-md border border-border p-md">
            <h3 className="text-body-sm font-medium text-text-primary">Step Preview</h3>
            <ol className="mt-sm flex flex-col gap-xs">
              {selected.steps.map((step, i) => (
                <li key={step.id} className="text-body-sm text-text-primary">
                  {i + 1}. {step.title}
                  {step.expected_duration_days && (
                    <span className="text-text-secondary"> — ~{step.expected_duration_days} days</span>
                  )}
                </li>
              ))}
            </ol>
          </div>
        )}
      </div>
    </Modal>
  )
}
