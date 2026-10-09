// Split out of ClientProfilePage.tsx (Phase 3 plan, Tier B1, 2026-09-03) — pure movement, no logic change.
import { useEffect, useState } from 'react'
import { Card } from '@/components/Card'
import { Button } from '@/components/Button'
import { ErrorState, Skeleton } from '@/components/QueryState'
import { useLatestFormResponse, usePlans, useSaveFormResponse } from '@/queries/plans'
import { useFormTemplate } from '@/queries/formTemplates'
import { useClient } from '@/queries/clients'
import { formatDateTime } from '@/lib/time'
import { showToast } from '@/lib/toast'
import { useUnsavedChangesGuard } from '@/lib/useUnsavedChangesGuard'
import { fillWidthClass } from '@/lib/formFields'
import { FormTableField } from './FormTableField'

type FormField = NonNullable<ReturnType<typeof useFormTemplate>['data']>['fields'][number]
type FormAnswers = Record<string, unknown>
type Client = NonNullable<ReturnType<typeof useClient>['data']>

// H9 (2026-09-13) - the console already knows the applicant's name, email, phone and date of
// birth, and still handed the consultant a blank "First name" to retype. A form's fields are
// free text authored by each consultancy, so the match is on what the label SAYS, normalised:
// "First Name", "first name*" and "Given name" are all the same question.
function normaliseLabel(label: string): string {
  return label
    .toLowerCase()
    .replace(/[^a-z ]/g, ' ')
    .replace(/ +/g, ' ')
    .trim()
}

// Only facts the profile actually holds. `nationality` resolves from the student's resident
// country - the nearest thing the profile records - and like every other prefill it is marked
// "from profile" so a consultant can correct it before saving rather than inheriting a guess.
function profileValueFor(label: string, client: Client): string | undefined {
  const l = normaliseLabel(label)
  const s = client.student
  const prefs = client.preferences
  const has = (...needles: string[]) => needles.some((n) => l.includes(n))
  if (has('first name', 'given name')) return s.first_name || undefined
  if (has('last name', 'surname', 'family name')) return s.last_name || undefined
  // "Full legal name" is the wording the seeded Applicant Background Form uses, so the name
  // needles cover the common variants rather than one exact spelling.
  if (
    has('full name', 'full legal name', 'legal name', 'name of applicant', 'name of the applicant') ||
    ['name', 'applicant name', 'student name', 'candidate name'].includes(l)
  )
    return [s.first_name, s.last_name].filter(Boolean).join(' ') || undefined
  if (has('email')) return s.email || undefined
  if (has('phone', 'mobile', 'contact number')) return s.phone || undefined
  if (has('date of birth', 'dob', 'birth date')) return prefs?.date_of_birth?.slice(0, 10) || undefined
  if (has('nationality', 'citizenship')) return prefs?.resident_country || undefined
  return undefined
}

// Flattened across groups - a "Personal details" section's children are ordinary fields.
function buildPrefill(fields: FormField[], client: Client | undefined): Record<string, string> {
  if (!client) return {}
  const out: Record<string, string> = {}
  const walk = (list: FormField[]) => {
    for (const field of list) {
      if (field.type === 'group') {
        walk(field.fields ?? [])
        continue
      }
      if (field.type !== 'text' && field.type !== 'long_text' && field.type !== 'date') continue
      const value = profileValueFor(field.label, client)
      if (value) out[field.id] = value
    }
  }
  walk(fields)
  return out
}

// FILLABLE (user, 2026-08-20: "if there is a form to fill they can fill and save… Both can see
// the details and edit") — real inputs per field type, prefilled from the latest saved response
// (which the applicant may have written from the app), saved back through the same
// POST /forms/{id}/submit the app uses. A table shows its saved rows and takes new ones here too
// (2026-10-08): the answer is the list of rows the app writes, each row keyed by column id.
function FillableField({
  field,
  answers,
  onChange,
  fromProfile,
  readOnly,
}: {
  field: FormField
  answers: FormAnswers
  onChange: (fieldId: string, value: unknown) => void
  // A case that moved to another consultancy: the answers still show, nothing can be changed.
  readOnly: boolean
  // Field ids currently showing a value taken from the applicant's profile rather than typed or
  // submitted (H9) - the tag disappears the moment the value is edited.
  fromProfile: Set<string>
}) {
  const value = answers[field.id]

  if (field.type === 'group') {
    return (
      <div className="flex flex-col gap-md rounded-md border border-border p-md">
        <p className="text-body-sm font-medium text-text-primary">{field.label}</p>
        <div className="grid grid-cols-6 gap-x-md gap-y-md">
          {(field.fields ?? []).map((child) => (
            <div key={child.id} className={`${fillWidthClass(child)} min-w-0`}>
              <FillableField
                field={child}
                answers={answers}
                onChange={onChange}
                fromProfile={fromProfile}
                readOnly={readOnly}
              />
            </div>
          ))}
        </div>
      </div>
    )
  }

  const label = (
    <span className="text-body-sm text-text-primary">
      {field.label}
      {field.required && <span className="text-required"> *</span>}
      {fromProfile.has(field.id) && (
        <span className="ml-xs text-caption font-normal text-text-secondary">from profile</span>
      )}
    </span>
  )

  switch (field.type) {
    case 'text':
      return (
        <label className="flex flex-col gap-xs">
          {label}
          <input
            type="text"
            className="h-9 w-full rounded-md border border-border bg-surface px-sm text-body-sm text-text-primary"
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
            className="w-full rounded-md border border-border bg-surface p-sm text-body-sm text-text-primary"
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
            className="h-9 w-full rounded-md border border-border bg-surface px-sm text-body-sm text-text-primary"
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
            className="h-9 w-full rounded-md border border-border bg-surface px-sm text-body-sm text-text-primary"
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
          {/* Each option is one <label>: box and text share a fixed gap, the whole thing is the
              click target, and the set wraps with an even gap both ways. */}
          <div className="flex flex-wrap gap-x-lg gap-y-sm">
            {(field.options ?? []).map((option) => (
              <label
                key={option}
                className="flex cursor-pointer items-center gap-xs text-body-sm text-text-primary has-disabled:cursor-not-allowed has-disabled:opacity-60"
              >
                <input
                  type="checkbox"
                  className="h-4 w-4 shrink-0 accent-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
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
      // Label on top like every other field; underneath, one compact Yes | No control, left
      // aligned and the height of a text input, so it lines up with its neighbour in a two-up row.
      return (
        <div className="flex flex-col gap-xs">
          {label}
          <div role="group" aria-label={field.label} className="flex h-9 w-fit overflow-hidden rounded-md border border-border">
            {(['Yes', 'No'] as const).map((option) => (
              <button
                key={option}
                type="button"
                aria-pressed={value === option}
                onClick={() => onChange(field.id, option)}
                className={`px-md text-body-sm font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary disabled:cursor-not-allowed disabled:opacity-60 ${
                  option === 'No' ? 'border-l border-border' : ''
                } ${value === option ? 'bg-pill-selected text-text-on-primary' : 'bg-surface text-text-primary'}`}
              >
                {option}
              </button>
            ))}
          </div>
        </div>
      )
    case 'table':
      return (
        <FormTableField
          field={field}
          value={value}
          readOnly={readOnly}
          onChange={(rows) => onChange(field.id, rows)}
          renderInput={(column, row, onCellChange) => (
            <FillableField field={column} answers={row} onChange={onCellChange} fromProfile={NO_PREFILL} readOnly={false} />
          )}
        />
      )
    default:
      return null
  }
}

// A table cell is never prefilled from the profile.
const NO_PREFILL = new Set<string>()

function LinkedFormViewer({
  formId,
  formName,
  clientId,
  readOnly,
  onDirtyChange,
}: {
  formId: string
  formName: string
  clientId: string
  readOnly: boolean
  // Tells the tab whether this form holds changes that have not been saved, so the pager and the
  // ways off the page can ask first.
  onDirtyChange: (dirty: boolean) => void
}) {
  const form = useFormTemplate(formId)
  const saved = useLatestFormResponse(formId, clientId)
  const saveForm = useSaveFormResponse(formId, clientId)
  const client = useClient(clientId)
  const [draft, setDraft] = useState<FormAnswers | null>(null)
  const dirty = draft !== null
  useEffect(() => {
    onDirtyChange(dirty)
  }, [dirty, onDirtyChange])

  if (form.isLoading || saved.isLoading) return <Skeleton className="h-24 rounded-lg" />
  if (form.isError || !form.data) {
    return <ErrorState message={`Could not load "${formName}".`} onRetry={() => form.refetch()} />
  }

  const savedAnswers = (saved.data?.answers ?? {}) as FormAnswers
  // Prefill fills the GAPS only (H9) - anything already answered from the app wins, and the
  // profile never overwrites what somebody actually typed.
  const prefill = buildPrefill(form.data.fields, client.data)
  const gaps = Object.fromEntries(
    Object.entries(prefill).filter(([id]) => {
      const existing = savedAnswers[id]
      return existing === undefined || existing === null || existing === ''
    }),
  )
  const answers = draft ?? { ...savedAnswers, ...gaps }
  const fromProfile = new Set(Object.keys(gaps).filter((id) => answers[id] === gaps[id]))

  return (
    <div className="flex flex-col gap-lg">
      {saved.data?.submitted_at && (
        <p className="text-caption text-text-secondary">Last saved {formatDateTime(saved.data.submitted_at)}</p>
      )}
      {/* One switch for every input on the form when the case is read-only. `min-w-0`: a
          fieldset is otherwise as wide as its widest child, which would let a wide table push
          the page sideways. */}
      <fieldset disabled={readOnly} className="min-w-0">
        {/* The fields sit on the same six-column grid the form builder's preview uses, so a half
            or third width field shares its row from md up (by the width of this box, not the
            window) and every field stacks full width below that. */}
        <div className="@container grid grid-cols-6 gap-x-md gap-y-md">
          {form.data.fields.map((field) => (
            <div key={field.id} className={`${fillWidthClass(field)} min-w-0`}>
              <FillableField
                field={field}
                answers={answers}
                fromProfile={fromProfile}
                readOnly={readOnly}
                onChange={(fieldId, value) => setDraft({ ...answers, [fieldId]: value })}
              />
            </div>
          ))}
        </div>
      </fieldset>
      {!readOnly && (
        <div className="flex items-center gap-sm">
          <Button
            disabled={draft === null}
            loading={saveForm.isPending}
            onClick={() =>
              saveForm.mutate(answers as Record<string, unknown>, {
                onSuccess: () => {
                  showToast(`${form.data?.name || formName} saved`)
                  setDraft(null)
                },
              })
            }
          >
            Save
          </Button>
          {saveForm.error && <p className="text-body-sm text-error">{saveForm.error.message}</p>}
        </div>
      )}
    </div>
  )
}

// The heading is the FORM's own name (the template's `name`, e.g. "Student Application Form"),
// not the plan step component's title it is linked under; the step stays named underneath. The
// component's name stands in only until the form has been read. The read is the one the viewer
// below makes too, so it costs nothing extra.
function FormHeading({ formId, fallbackName, stepTitle }: { formId: string; fallbackName: string; stepTitle: string }) {
  const form = useFormTemplate(formId)
  return (
    <>
      <h2 className="text-h3 text-text-primary">{form.data?.name || fallbackName}</h2>
      <p className="text-caption text-text-secondary">From step: {stepTitle}</p>
    </>
  )
}

// User-requested (2026-08-19) — "if there are any forms linked to the plan involved, then show
// the forms one by one in a tab inside client details." Every form_link component across every
// step, in step order, "one by one" via a pager rather than all stacked at once — same pattern
// Manage Questions/Course Suggestions detail popups already use elsewhere in this app for
// paging through a set one at a time.
export function FormsTab({ clientId, readOnly = false }: { clientId: string; readOnly?: boolean }) {
  // Every plan on the case, not just one (2026-09-09) — a form linked from the second plan is no
  // less the student's to fill than one linked from the first.
  const plans = usePlans(clientId)
  const [index, setIndex] = useState(0)
  // Unsaved answers are asked about before they are left behind: by the pager below, a link
  // elsewhere in the console, the browser's Back, or closing the tab.
  const [dirty, setDirty] = useState(false)
  const guard = useUnsavedChangesGuard(dirty, {
    title: 'Discard your changes?',
    body: 'You have changed this form. If you leave now, those changes will be lost.',
  })
  if (plans.isLoading) return <Skeleton className="h-24 rounded-lg" />
  if (!plans.data) return <ErrorState message="Could not load the plans." onRetry={() => plans.refetch()} error={plans.error} />

  const links = (plans.data.items ?? [])
    .flatMap((plan) => [...plan.steps].sort((a, b) => a.position - b.position))
    .flatMap((step) =>
      step.components
        .filter((c) => c.type === 'form_link')
        .map((c) => {
          // `form_template_id` is the contract key (openapi.yaml, mobile); this tab briefly read
          // a drifted `form_id` and silently showed "No forms linked" for every correctly-seeded
          // plan (user, 2026-08-20: "I cannot see the Form associated with the plan").
          const payload = (c.payload ?? {}) as { form_template_id?: string; form_name?: string }
          return {
            stepTitle: step.title,
            formId: payload.form_template_id ?? '',
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
          <FormHeading formId={current.formId} fallbackName={current.formName} stepTitle={current.stepTitle} />
        </div>
        <div className="flex items-center gap-sm">
          <Button variant="secondary" disabled={index === 0} onClick={() => guard.requestLeave(() => setIndex((i) => Math.max(0, i - 1)))}>
            ← Back
          </Button>
          <span className="text-caption text-text-secondary">
            Form {index + 1} of {links.length}
          </span>
          <Button
            variant="secondary"
            disabled={index === links.length - 1}
            onClick={() => guard.requestLeave(() => setIndex((i) => Math.min(links.length - 1, i + 1)))}
          >
            Next →
          </Button>
        </div>
      </div>
      {/* Keyed by form: each form starts from its own saved answers, never the last one's edits. */}
      <LinkedFormViewer
        key={current.formId}
        formId={current.formId}
        formName={current.formName}
        clientId={clientId}
        readOnly={readOnly}
        onDirtyChange={setDirty}
      />
      {guard.dialog}
    </Card>
  )
}
