import { useEffect, useState } from 'react'
import { Modal } from '@/components/Modal'
import { Button } from '@/components/Button'
import { Card } from '@/components/Card'
import { TextField } from '@/components/TextField'
import { ErrorState, Skeleton } from '@/components/QueryState'
import { useAssignPlan, usePlanTemplates } from '@/queries/plans'

// User-requested (2026-08-15) — "let consultant assign a plan in Overview tab itself. on button
// click a popup appears to select the plan." Was a standalone page (AssignPlanPage.tsx,
// /clients/:id/assign-plan) reached only from Plan tab's own "no plan yet" state — folded into a
// popup so both Overview and Plan tab can trigger the same flow inline, same move this session
// already made for Create Applicant/Add Lead/etc.
/**
 * A case can run as many plans as the consultancy wants (2026-09-09), so this modal adds ONE more
 * — there is nothing to choose between and no scope to pick. The short-lived `application` prop
 * that bound a plan to a college is gone with the model that needed it: a plan is not tied to an
 * application, a course or a college, because a consultancy running one plan across four colleges
 * would otherwise have been made to invent three plans it does not want.
 *
 * What it asks for instead is a NAME. It is prefilled from the chosen template, which is right for
 * the common case, and editable, which is what makes two plans off one template usable.
 */
export function AssignPlanModal({ clientId, onClose }: { clientId: string; onClose: () => void }) {
  const templates = usePlanTemplates()
  const assignPlan = useAssignPlan(clientId)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [name, setName] = useState('')
  // Tracks whether the consultant has typed their own name, so prefilling from the template never
  // overwrites something they wrote.
  const [nameEdited, setNameEdited] = useState(false)
  // T8: one key per modal open — double-clicking Assign is one operation.
  const [idempotencyKey] = useState(() => crypto.randomUUID())

  const selected = templates.data?.find((t) => t.id === selectedId)

  useEffect(() => {
    if (!nameEdited && selected) setName(selected.name)
  }, [selected, nameEdited])

  return (
    <Modal
      onClose={onClose}
      title="Add a plan"
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
              assignPlan.mutate({ templateId: selected.id, idempotencyKey, name }, { onSuccess: onClose })
            }
          >
            Add This Plan
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-md">
        <p className="text-body-sm text-text-secondary">
          Pick the template to start from. A case can run several plans side by side &mdash; documents, one per
          country, the visa &mdash; so the student works through them in parallel instead of one queue.
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
          <>
            <div className="flex flex-col gap-xs">
              <TextField
                label="Call this plan"
                required
                value={name}
                onChange={(e) => {
                  setNameEdited(true)
                  setName(e.target.value)
                }}
              />
              <p className="text-caption text-text-secondary">
                What the student sees at the top of this plan. Two plans from the same template need different names.
              </p>
            </div>
            <div className="rounded-md border border-border p-md">
              <h3 className="text-body-sm font-medium text-text-primary">Step Preview</h3>
              <ol className="mt-sm flex flex-col gap-xs">
                {selected.steps.map((step, i) => (
                  <li key={step.id} className="text-body-sm text-text-primary">
                    {i + 1}. {step.title}
                    {step.expected_duration_days && (
                      <span className="text-text-secondary"> &mdash; ~{step.expected_duration_days} days</span>
                    )}
                    {step.description && <p className="text-caption text-text-secondary">{step.description}</p>}
                  </li>
                ))}
              </ol>
            </div>
          </>
        )}
      </div>
    </Modal>
  )
}
