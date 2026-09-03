// Split out of ClientProfilePage.tsx (Phase 3 plan, Tier B1, 2026-09-03) — pure movement, no logic change.
import { useState } from 'react'
import { Card } from '@/components/Card'
import { Button } from '@/components/Button'
import { ErrorState, Skeleton } from '@/components/QueryState'
import { useLatestFormResponse, usePlan, useSaveFormResponse } from '@/queries/plans'
import { useFormTemplate } from '@/queries/formTemplates'
import { formatDateTime } from '@/lib/time'

type FormField = NonNullable<ReturnType<typeof useFormTemplate>['data']>['fields'][number]
type FormAnswers = Record<string, unknown>

// FILLABLE (user, 2026-08-20: "if there is a form to fill they can fill and save… Both can see
// the details and edit") — real inputs per field type, prefilled from the latest saved response
// (which the applicant may have written from the app), saved back through the same
// POST /forms/{id}/submit the app uses. Tables stay read-only here — their row editor lives in
// the app; the saved value still shows.
function FillableField({
  field,
  answers,
  onChange,
}: {
  field: FormField
  answers: FormAnswers
  onChange: (fieldId: string, value: unknown) => void
}) {
  const value = answers[field.id]

  if (field.type === 'group') {
    return (
      <div className="flex flex-col gap-sm rounded-md border border-border p-md">
        <p className="text-body-sm font-medium text-text-primary">{field.label}</p>
        <div className="flex flex-col gap-sm pl-md">
          {(field.fields ?? []).map((child) => (
            <FillableField key={child.id} field={child} answers={answers} onChange={onChange} />
          ))}
        </div>
      </div>
    )
  }

  const label = (
    <span className="text-body-sm text-text-primary">
      {field.label}
      {field.required && <span className="text-required"> *</span>}
    </span>
  )

  switch (field.type) {
    case 'text':
      return (
        <label className="flex flex-col gap-xs">
          {label}
          <input
            type="text"
            className="h-9 rounded-md border border-border bg-surface px-sm text-body-sm text-text-primary"
            value={typeof value === 'string' ? value : ''}
            onChange={(e) => onChange(field.id, e.target.value)}
          />
        </label>
      )
    case 'long_text':
      return (
        <label className="flex flex-col gap-xs">
          {label}
          <textarea
            rows={3}
            className="rounded-md border border-border bg-surface p-sm text-body-sm text-text-primary"
            value={typeof value === 'string' ? value : ''}
            onChange={(e) => onChange(field.id, e.target.value)}
          />
        </label>
      )
    case 'date':
      return (
        <label className="flex flex-col gap-xs">
          {label}
          <input
            type="date"
            className="h-9 w-fit rounded-md border border-border bg-surface px-sm text-body-sm text-text-primary"
            value={typeof value === 'string' ? value.slice(0, 10) : ''}
            onChange={(e) => onChange(field.id, e.target.value)}
          />
        </label>
      )
    case 'single_select':
      return (
        <label className="flex flex-col gap-xs">
          {label}
          <select
            className="h-9 w-fit rounded-md border border-border bg-surface px-sm text-body-sm text-text-primary"
            value={typeof value === 'string' ? value : ''}
            onChange={(e) => onChange(field.id, e.target.value)}
          >
            <option value="">—</option>
            {(field.options ?? []).map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </label>
      )
    case 'multi_select': {
      const selected = Array.isArray(value) ? (value as string[]) : []
      return (
        <div className="flex flex-col gap-xs">
          {label}
          <div className="flex flex-wrap gap-sm">
            {(field.options ?? []).map((option) => (
              <label key={option} className="flex items-center gap-xs text-body-sm text-text-primary">
                <input
                  type="checkbox"
                  className="h-4 w-4"
                  checked={selected.includes(option)}
                  onChange={(e) =>
                    onChange(field.id, e.target.checked ? [...selected, option] : selected.filter((o) => o !== option))
                  }
                />
                {option}
              </label>
            ))}
          </div>
        </div>
      )
    }
    case 'yes_no':
      return (
        <div className="flex items-center justify-between gap-md">
          {label}
          <div className="flex gap-xs">
            {(['Yes', 'No'] as const).map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => onChange(field.id, option)}
                className={`rounded-full border px-sm py-1 text-caption font-medium ${
                  value === option
                    ? 'border-pill-selected bg-pill-selected text-text-on-primary'
                    : 'border-border bg-surface text-text-primary'
                }`}
              >
                {option}
              </button>
            ))}
          </div>
        </div>
      )
    case 'table':
      return (
        <div className="flex items-center justify-between border-b border-border pb-xs">
          <div>
            {label}
            {field.table_columns && field.table_columns.length > 0 && (
              <p className="text-caption text-text-secondary">
                Columns: {field.table_columns.map((c) => c.label).join(', ')} — rows are filled from the app
              </p>
            )}
          </div>
          <span className="shrink-0 rounded-full bg-background px-sm py-0.5 text-caption font-medium text-text-secondary">
            table
          </span>
        </div>
      )
    default:
      return null
  }
}

function LinkedFormViewer({ formId, formName, clientId }: { formId: string; formName: string; clientId: string }) {
  const form = useFormTemplate(formId)
  const saved = useLatestFormResponse(formId, clientId)
  const saveForm = useSaveFormResponse(formId, clientId)
  const [draft, setDraft] = useState<FormAnswers | null>(null)

  if (form.isLoading || saved.isLoading) return <Skeleton className="h-24 rounded-lg" />
  if (form.isError || !form.data) {
    return <ErrorState message={`Could not load "${formName}".`} onRetry={() => form.refetch()} />
  }

  const answers = draft ?? ((saved.data?.answers ?? {}) as FormAnswers)

  return (
    <div className="flex flex-col gap-sm">
      {saved.data?.submitted_at && (
        <p className="text-caption text-text-secondary">Last saved {formatDateTime(saved.data.submitted_at)}</p>
      )}
      {form.data.fields.map((field) => (
        <FillableField
          key={field.id}
          field={field}
          answers={answers}
          onChange={(fieldId, value) => setDraft({ ...answers, [fieldId]: value })}
        />
      ))}
      <div className="flex items-center gap-sm">
        <Button
          disabled={draft === null}
          loading={saveForm.isPending}
          onClick={() => saveForm.mutate(answers as Record<string, unknown>, { onSuccess: () => setDraft(null) })}
        >
          Save
        </Button>
        {saveForm.error && <p className="text-body-sm text-error">{saveForm.error.message}</p>}
      </div>
    </div>
  )
}

// User-requested (2026-08-19) — "if there are any forms linked to the plan involved, then show
// the forms one by one in a tab inside client details." Every form_link component across every
// step, in step order, "one by one" via a pager rather than all stacked at once — same pattern
// Manage Questions/Course Suggestions detail popups already use elsewhere in this app for
// paging through a set one at a time.
export function FormsTab({ clientId }: { clientId: string }) {
  const plan = usePlan(clientId)
  const [index, setIndex] = useState(0)
  if (plan.isLoading) return <Skeleton className="h-24 rounded-lg" />
  if (!plan.data) return <ErrorState message="Could not load the plan." onRetry={() => plan.refetch()} />

  const links = [...plan.data.steps]
    .sort((a, b) => a.position - b.position)
    .flatMap((step) =>
      step.components
        .filter((c) => c.type === 'form_link')
        .map((c) => {
          // `form_template_id` is the contract key (openapi.yaml, mobile, mock server); this tab
          // briefly read a drifted `form_id` and silently showed "No forms linked" for every
          // correctly-seeded plan (user, 2026-08-20: "I cannot see the Form associated with the
          // plan"). Legacy `form_id` stays as a fallback for components written during the drift.
          const payload = (c.payload ?? {}) as { form_template_id?: string; form_id?: string; form_name?: string }
          return {
            stepTitle: step.title,
            formId: payload.form_template_id ?? payload.form_id ?? '',
            formName: payload.form_name || c.label || 'Untitled form',
          }
        }),
    )
    .filter((l) => l.formId)

  if (links.length === 0) {
    return (
      <Card>
        <p className="text-body text-text-secondary">No forms linked to this plan.</p>
      </Card>
    )
  }

  const current = links[Math.min(index, links.length - 1)]

  return (
    <Card className="flex flex-col gap-md">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-h3 text-text-primary">{current.formName}</h2>
          <p className="text-caption text-text-secondary">From step: {current.stepTitle}</p>
        </div>
        <div className="flex items-center gap-sm">
          <Button variant="secondary" disabled={index === 0} onClick={() => setIndex((i) => Math.max(0, i - 1))}>
            ← Back
          </Button>
          <span className="text-caption text-text-secondary">
            Form {index + 1} of {links.length}
          </span>
          <Button
            variant="secondary"
            disabled={index === links.length - 1}
            onClick={() => setIndex((i) => Math.min(links.length - 1, i + 1))}
          >
            Next →
          </Button>
        </div>
      </div>
      <LinkedFormViewer formId={current.formId} formName={current.formName} clientId={clientId} />
    </Card>
  )
}
