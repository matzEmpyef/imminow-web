import { useRef } from 'react'
import { ExternalLink, FileText, Link2, Loader2, Upload } from 'lucide-react'
import { useSaveStepResponses, useUploadStepFile } from '@/queries/plans'
import { TextComponentContent } from './PlanComponentBlock'
import type { components } from '@/api/schema'

type Component = components['schemas']['Component']
type Step = components['schemas']['Step']

// The FILLABLE rendering of a live step's components (user, 2026-08-20: "both consultant and
// applicant should be able to fill the page and save it… if there is a checklist an applicant
// can select and save… if there is a file upload, then applicant can upload file and save. Both
// can see the details and edit"). Reads/writes `Step.responses[component.id]` — the same state
// the mobile Step Detail saves — via `PATCH /steps/{id}/responses`, one component per save.
//
// Distinct from `ComponentPreview` (PlanComponentBlock.tsx), which stays the STATIC mock used by
// Plan Templates, where no live step exists to hold any fill state.
//
// `disabled` renders the same controls inert — used for locked (not started) and done (frozen)
// steps, where the saved state still shows but can't change.
export function ComponentFill({
  component,
  step,
  clientId,
  disabled,
}: {
  component: Component
  step: Step
  clientId: string
  disabled: boolean
}) {
  const save = useSaveStepResponses(clientId)
  const uploadFile = useUploadStepFile(clientId)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const payload = (component.payload ?? {}) as Record<string, unknown>
  const responses = (step.responses ?? {}) as Record<string, Record<string, unknown> | undefined>
  const saved = responses[component.id] ?? {}

  const label = component.label || 'Component'

  function saveComponent(value: Record<string, unknown>) {
    save.mutate({ stepId: step.id, responses: { [component.id]: value } })
  }

  switch (component.type) {
    case 'text':
      // No heading unless an older component carries one (Text has no label since 2026-09-10).
      return (
        <div>
          {component.label && <span className="text-body-sm font-medium text-text-primary">{component.label}</span>}
          <div className={component.label ? 'mt-xs' : ''}>
            <TextComponentContent payload={payload} />
          </div>
        </div>
      )

    case 'checklist': {
      const items = Array.isArray(payload.items) ? (payload.items as string[]) : []
      const checked = (saved.items ?? {}) as Record<string, boolean>
      return (
        <div>
          <span className="text-body-sm font-medium text-text-primary">{label}</span>
          <div className="mt-xs flex flex-col gap-xs">
            {items.map((item) => (
              <label key={item} className="flex items-center gap-xs text-body-sm text-text-primary">
                <input
                  type="checkbox"
                  className="h-4 w-4"
                  disabled={disabled || save.isPending}
                  checked={checked[item] === true}
                  onChange={(e) =>
                    saveComponent({
                      items: Object.fromEntries(
                        items.map((i) => [i, i === item ? e.target.checked : checked[i] === true]),
                      ),
                    })
                  }
                />
                {item}
              </label>
            ))}
          </div>
        </div>
      )
    }

    case 'questionnaire': {
      const questions = Array.isArray(payload.questions) ? (payload.questions as string[]) : []
      const answers = (saved.answers ?? {}) as Record<string, string>
      return (
        <div>
          <span className="text-body-sm font-medium text-text-primary">{label}</span>
          <div className="mt-xs flex flex-col gap-sm">
            {questions.map((question) => (
              <div key={question} className="flex items-center justify-between gap-md">
                <span className="text-body-sm text-text-primary">{question}</span>
                <div className="flex gap-xs">
                  {(['Yes', 'No'] as const).map((option) => (
                    <button
                      key={option}
                      type="button"
                      disabled={disabled || save.isPending}
                      onClick={() => saveComponent({ answers: { ...answers, [question]: option } })}
                      className={`rounded-full border px-sm py-1 text-caption font-medium ${
                        answers[question] === option
                          ? 'border-pill-selected bg-pill-selected text-text-on-primary'
                          : 'border-border bg-surface text-text-primary'
                      } disabled:opacity-50`}
                    >
                      {option}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )
    }

    case 'file_upload': {
      const fileName = typeof saved.file_name === 'string' ? saved.file_name : null
      const busy = uploadFile.isPending || save.isPending
      // The catalog document it asks for (2026-09-10), when that isn't already what the label says.
      const docName = typeof payload.document_type_name === 'string' ? payload.document_type_name : null
      return (
        <div>
          <span className="text-body-sm font-medium text-text-primary">{label}</span>
          {docName && docName !== label && <span className="ml-xs text-caption text-text-secondary">· {docName}</span>}
          <div className="mt-xs flex h-10 items-center justify-between rounded-md border border-dashed border-border bg-background px-3">
            <span className="flex min-w-0 items-center gap-xs text-caption text-text-secondary">
              {fileName ? (
                <>
                  <FileText className="h-3.5 w-3.5 shrink-0 text-success" />
                  <span className="truncate text-text-primary">{fileName}</span>
                </>
              ) : (
                'No file uploaded'
              )}
            </span>
            {!disabled && (
              <>
                <input
                  ref={fileInputRef}
                  type="file"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0]
                    if (!file) return
                    uploadFile.mutate(
                      { stepId: step.id, file },
                      {
                        onSuccess: (upload) =>
                          saveComponent({
                            file_name: upload?.filename ?? file.name,
                            upload_id: upload?.id,
                            uploaded_at: new Date().toISOString(),
                          }),
                      },
                    )
                    e.target.value = ''
                  }}
                />
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => fileInputRef.current?.click()}
                  className="flex shrink-0 items-center gap-xs rounded-full border border-border px-sm py-xs text-caption font-medium text-text-primary hover:bg-surface disabled:opacity-50"
                >
                  {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Upload className="h-3 w-3" />}
                  {fileName ? 'Replace' : 'Upload'}
                </button>
              </>
            )}
          </div>
          {(uploadFile.error ?? save.error) && (
            <p className="mt-xs text-caption text-error">{(uploadFile.error ?? save.error)?.message}</p>
          )}
        </div>
      )
    }

    case 'form_link': {
      // The linked form is viewed and filled in the Forms tab (its own richer surface) — this
      // block just points there rather than duplicating the whole form inline.
      return (
        <div>
          <span className="text-body-sm font-medium text-text-primary">{label}</span>
          <div className="mt-xs flex h-9 w-fit items-center gap-xs rounded-full border border-border bg-background px-sm text-caption font-medium text-text-secondary">
            <Link2 className="h-3 w-3" />
            View and fill in the Forms tab
          </div>
        </div>
      )
    }

    case 'weblink': {
      // Nothing to fill or save — the student opens it from the app. The consultant can open the
      // same link here, in a new tab, to check where it goes.
      const url = typeof payload.url === 'string' ? payload.url : ''
      const buttonText = typeof payload.button_text === 'string' && payload.button_text ? payload.button_text : 'Open link'
      return (
        <div>
          <span className="text-body-sm font-medium text-text-primary">{label}</span>
          <div className="mt-xs flex flex-col gap-xs">
            {url ? (
              <a
                href={url}
                target="_blank"
                rel="noreferrer"
                className="flex h-9 w-fit items-center gap-xs rounded-full border border-border bg-background px-sm text-caption font-medium text-primary hover:bg-surface"
              >
                <ExternalLink className="h-3 w-3" />
                {buttonText}
              </a>
            ) : (
              <span className="text-caption italic text-text-secondary">No link set</span>
            )}
            {url && <span className="truncate text-caption text-text-secondary">{url}</span>}
          </div>
        </div>
      )
    }

    default:
      return null
  }
}
