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
export function AssignPlanModal({ clientId, onClose }: { clientId: string; onClose: () => void }) {
  const templates = usePlanTemplates()
  const assignPlan = useAssignPlan(clientId)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  // T8: one key per modal open — double-clicking Assign is one operation.
  const [idempotencyKey] = useState(() => crypto.randomUUID())

  const selected = templates.data?.find((t) => t.id === selectedId)

  return (
    <Modal
      onClose={onClose}
      title="Assign a Plan"
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
              assignPlan.mutate({ templateId: selected.id, idempotencyKey }, { onSuccess: onClose })
            }
          >
            Assign This Plan
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-md">
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
