import { useState, type ReactNode } from 'react'
import { CheckSquare, Plus, X } from 'lucide-react'
import { SelectField } from '@/components/SelectField'
import { Modal } from '@/components/Modal'
import { Button } from '@/components/Button'
import { TextField } from '@/components/TextField'
import { RichTextEditor } from '@/components/RichTextEditor'
import { useFormTemplates } from '@/queries/formTemplates'
import { useDocumentTypes } from '@/queries/studentDocuments'
import {
  COMPONENT_TYPES,
  COMPONENT_TYPE_LABELS,
  isHttpUrl,
  newComponentId,
  type ComponentInput,
  type ComponentType,
} from '@/lib/planComponents'

function readPayload(component: ComponentInput | undefined) {
  return (component?.payload ?? {}) as Record<string, unknown>
}

// Text components written before rich text (2026-09-10) hold plain text. Opened in the rich
// editor as paragraphs, so editing one keeps its words and line breaks.
function plainToHtml(text: string): string {
  if (!text.trim()) return ''
  const escape = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  return text
    .split(/\n{2,}/)
    .map((para) => `<p>${escape(para).replace(/\n/g, '<br>')}</p>`)
    .join('')
}

function htmlHasText(html: string): boolean {
  return html.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').trim().length > 0
}

// The "Other — not in this list" choice for a File Upload: no catalog document, the name is typed
// in. Also what an older File Upload (made before the dropdown) opens as.
const OTHER_DOCUMENT = 'other'

const DEFAULT_OPTIONS = ['Yes', 'No']

/** Everything type-specific the popup edits. */
interface Draft {
  label: string
  content: string
  entries: string[]
  options: string[]
  formId: string
  url: string
  buttonText: string
  documentTypeId: string
  documentDetail: string
}

/**
 * The draft for `type`: the component's saved values when it IS that type, blank otherwise.
 * Switching type rebuilds the draft from this (user, 2026-09-10: "When we switch the component
 * type, reset the content also please") — checklist items used to follow you into Questionnaire
 * because both read the same list. Switching back to the type being edited restores what it had.
 */
function draftFor(component: ComponentInput | undefined, type: ComponentType): Draft {
  const same = component?.type === type
  const payload = same ? readPayload(component) : {}
  const label = same ? (component?.label ?? '') : ''
  const rawContent = typeof payload.content === 'string' ? payload.content : ''
  const savedDocumentName = typeof payload.document_type_name === 'string' ? payload.document_type_name : ''
  const list = (key: string) => (Array.isArray(payload[key]) ? (payload[key] as string[]) : [])
  return {
    label,
    // Rich text (user, 2026-09-10: "i want rich text also"), stored as HTML with format 'html'.
    content: payload.format === 'html' ? rawContent : plainToHtml(rawContent),
    entries: type === 'checklist' ? list('items') : type === 'questionnaire' ? list('questions') : [],
    // Answer options for a questionnaire (2026-08-23). Yes/No was hardcoded in the app until then,
    // so an existing component with no `options` falls back to that pair, as does a new one.
    options: list('options').length >= 2 ? list('options') : DEFAULT_OPTIONS,
    // `form_template_id` is the CONTRACT key; `form_id` is a legacy key read as a fallback so old
    // components stay editable, never written again.
    formId:
      typeof payload.form_template_id === 'string'
        ? payload.form_template_id
        : typeof payload.form_id === 'string'
          ? payload.form_id
          : '',
    // Web Link (2026-09-10): the address the student's phone opens, and optional button wording.
    url: typeof payload.url === 'string' ? payload.url : '',
    buttonText: typeof payload.button_text === 'string' ? payload.button_text : '',
    documentTypeId:
      typeof payload.document_type_id === 'string' ? payload.document_type_id : same && type === 'file_upload' ? OTHER_DOCUMENT : '',
    documentDetail:
      savedDocumentName && label.startsWith(`${savedDocumentName} — `) ? label.slice(savedDocumentName.length + 3) : '',
  }
}

function Panel({ title, count, children }: { title: string; count?: number; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-sm rounded-lg border border-border bg-background p-md">
      <p className="text-body-sm font-medium text-text-primary">
        {title}
        {count != null && count > 0 && <span className="ml-xs text-caption text-text-secondary">({count})</span>}
      </p>
      {children}
    </section>
  )
}

// A small "+ Add …" button level with the input beside it (user, 2026-09-10: "button needs to have
// icon and smaller font"). Enter in the input does the same.
function AddRow({
  label,
  value,
  onChange,
  onAdd,
  buttonText,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  onAdd: () => void
  buttonText: string
}) {
  return (
    <div className="flex items-center gap-sm">
      <TextField
        label={label}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            onAdd()
          }
        }}
        className="flex-1"
      />
      <Button
        type="button"
        variant="secondary"
        size="sm"
        onClick={onAdd}
        disabled={!value.trim()}
        className="inline-flex shrink-0 items-center gap-xs"
      >
        <Plus className="h-3.5 w-3.5" aria-hidden />
        {buttonText}
      </Button>
    </div>
  )
}

// User-requested — "just like a WordPress page setup.. the already mentioned components can be
// added multiple times... Don't want a checkbox to select which component." A repeatable popup:
// click "Add Component" as many times as you want, even for the same type. Doubles as the Edit
// Component popup when `editingComponent` is supplied. Shared between Plan Templates and the live
// client Plan editor. Each type gets its own fields below the Type row: rich text for `text`, an
// item list for `checklist`, questions and answer options for `questionnaire`, a form picker for
// `form_link`, the catalog document for `file_upload` (2026-09-10) and an address for `weblink`.
export function AddComponentModal({
  editingComponent,
  onSubmit,
  onClose,
}: {
  editingComponent?: ComponentInput
  onSubmit: (component: ComponentInput) => void
  onClose: () => void
}) {
  const isEditing = Boolean(editingComponent)
  const [type, setType] = useState<ComponentType>(editingComponent?.type ?? 'text')
  const [draft, setDraft] = useState<Draft>(() => draftFor(editingComponent, editingComponent?.type ?? 'text'))
  // What is being typed into an "add" input — not part of the component until added.
  const [entryDraft, setEntryDraft] = useState('')
  const [optionDraft, setOptionDraft] = useState('')

  const forms = useFormTemplates()
  // File Upload names WHICH document it collects (user, 2026-09-10), from the document catalog —
  // the platform's shared list plus this consultancy's own. payload.document_type_id is what lets
  // the Sentpo app show that document's instructions and offer a copy the student already has.
  const documentTypes = useDocumentTypes()
  const documentOptions = documentTypes.data?.items ?? []
  const chosenDocument = documentOptions.find((t) => t.id === draft.documentTypeId)

  function update(patch: Partial<Draft>) {
    setDraft((prev) => ({ ...prev, ...patch }))
  }

  function changeType(next: ComponentType) {
    setType(next)
    setDraft(draftFor(editingComponent, next))
    setEntryDraft('')
    setOptionDraft('')
  }

  function addEntry() {
    const next = entryDraft.trim()
    if (!next) return
    update({ entries: [...draft.entries, next] })
    setEntryDraft('')
  }

  function addOption() {
    const next = optionDraft.trim()
    if (!next || draft.options.includes(next)) return
    update({ options: [...draft.options, next] })
    setOptionDraft('')
  }

  const urlValid = isHttpUrl(draft.url)

  // NO LABEL for a catalog document (user, 2026-09-10: "Why we need label for File Upload?") —
  // the document's own name says what is being collected, and becomes the label on save. "Other"
  // needs a name typed in; a document collected more than once (an `instance` type) takes an
  // optional "Which one?": "Letter of recommendation — from your employer".
  function fileUploadLabel(): string {
    if (!chosenDocument) return draft.label
    return chosenDocument.cardinality === 'instance' && draft.documentDetail.trim()
      ? `${chosenDocument.name} — ${draft.documentDetail.trim()}`
      : chosenDocument.name
  }

  function buildPayload(): Record<string, unknown> {
    switch (type) {
      case 'text':
        return { content: draft.content, format: 'html' }
      case 'checklist':
        return { items: draft.entries }
      case 'questionnaire':
        return { questions: draft.entries, options: draft.options }
      case 'form_link': {
        if (!draft.formId) return {}
        const form = forms.data?.find((f) => f.id === draft.formId)
        // `form_name` is a display convenience only; `form_template_id` is what counts.
        return { form_template_id: draft.formId, form_name: form?.name ?? '' }
      }
      case 'weblink':
        return draft.buttonText.trim()
          ? { url: draft.url.trim(), button_text: draft.buttonText.trim() }
          : { url: draft.url.trim() }
      case 'file_upload':
        // `document_type_name` is display only (builder row, preview); the id is what counts.
        return chosenDocument ? { document_type_id: chosenDocument.id, document_type_name: chosenDocument.name } : {}
      default:
        return {}
    }
  }

  // Text has no label at all (user, 2026-09-10: "No need of label for Text component"); it needs
  // content instead. A File Upload of a catalog document takes its label from the document.
  const labelRequired = type !== 'text' && !(type === 'file_upload' && chosenDocument)
  const canSubmit =
    !(labelRequired && !draft.label.trim()) &&
    (type !== 'weblink' || urlValid) &&
    (type !== 'text' || htmlHasText(draft.content)) &&
    (type !== 'file_upload' || Boolean(draft.documentTypeId))

  function handleSubmit() {
    if (!canSubmit) return
    onSubmit({
      id: editingComponent?.id ?? newComponentId(),
      type,
      label: type === 'text' ? '' : type === 'file_upload' ? fileUploadLabel() : draft.label,
      payload: buildPayload(),
    })
    onClose()
  }

  function removeButton(name: string, onRemove: () => void, disabled = false) {
    return (
      <button
        type="button"
        onClick={onRemove}
        disabled={disabled}
        aria-label={`Remove ${name}`}
        title="Remove"
        className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-text-secondary hover:bg-error/10 hover:text-error disabled:cursor-not-allowed disabled:opacity-30"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    )
  }

  return (
    <Modal
      onClose={onClose}
      title={isEditing ? 'Edit Component' : 'Add Component'}
      widthRem={36}
      footer={
        <Button type="button" onClick={handleSubmit} disabled={!canSubmit}>
          {isEditing ? 'Save Changes' : 'Add Component'}
        </Button>
      }
    >
      <div className="flex flex-col gap-md">
        <SelectField
          label="Type"
          id="component-type"
          value={type}
          onChange={(e) => changeType(e.target.value as ComponentType)}
        >
          {COMPONENT_TYPES.map((t) => (
            <option key={t} value={t}>
              {COMPONENT_TYPE_LABELS[t]}
            </option>
          ))}
        </SelectField>

        {type !== 'text' && type !== 'file_upload' && (
          <TextField label="Label" value={draft.label} onChange={(e) => update({ label: e.target.value })} />
        )}

        {type === 'text' && (
          <div className="flex flex-col gap-xs">
            <p className="text-body-sm font-medium text-text-primary">Content to display</p>
            <RichTextEditor
              value={draft.content}
              onChange={(content) => update({ content })}
              minHeightRem={10}
              ariaLabel="Content to display"
              placeholder="Instructions, notes, anything the student should read in this step…"
            />
          </div>
        )}

        {type === 'checklist' && (
          <Panel title="Checklist items" count={draft.entries.length}>
            {draft.entries.length === 0 ? (
              <p className="text-caption text-text-secondary">No items yet. Each one becomes a box the student ticks.</p>
            ) : (
              <ul className="flex flex-col divide-y divide-border overflow-hidden rounded-md border border-border bg-surface">
                {draft.entries.map((entry, i) => (
                  <li key={i} className="flex items-start gap-sm px-sm py-xs">
                    <CheckSquare className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden />
                    <span className="min-w-0 flex-1 break-words text-body-sm text-text-primary">{entry}</span>
                    {removeButton(entry, () => update({ entries: draft.entries.filter((_, n) => n !== i) }))}
                  </li>
                ))}
              </ul>
            )}
            <AddRow label="New item" value={entryDraft} onChange={setEntryDraft} onAdd={addEntry} buttonText="Add item" />
          </Panel>
        )}

        {/* Questions, then the answers every question offers, then how one will look to the
            student (user, 2026-09-10: "Add Question also improve the UX"). */}
        {type === 'questionnaire' && (
          <>
            <Panel title="Questions" count={draft.entries.length}>
              {draft.entries.length === 0 ? (
                <p className="text-caption text-text-secondary">No questions yet.</p>
              ) : (
                <ol className="flex flex-col divide-y divide-border overflow-hidden rounded-md border border-border bg-surface">
                  {draft.entries.map((entry, i) => (
                    <li key={i} className="flex items-start gap-sm px-sm py-xs">
                      <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-caption font-medium text-primary">
                        {i + 1}
                      </span>
                      <span className="min-w-0 flex-1 break-words text-body-sm text-text-primary">{entry}</span>
                      {removeButton(entry, () => update({ entries: draft.entries.filter((_, n) => n !== i) }))}
                    </li>
                  ))}
                </ol>
              )}
              <AddRow
                label="New question"
                value={entryDraft}
                onChange={setEntryDraft}
                onAdd={addEntry}
                buttonText="Add question"
              />
            </Panel>

            <Panel title="Answer options">
              <p className="text-caption text-text-secondary">Every question is answered with one of these. Keep at least two.</p>
              <div className="flex flex-wrap gap-xs">
                {draft.options.map((option, i) => (
                  <span
                    key={option}
                    className="flex items-center gap-0.5 rounded-full border border-border bg-surface py-0.5 pl-sm pr-0.5 text-body-sm text-text-primary"
                  >
                    {option}
                    {/* Never below two: one option is not a question, it is a statement. */}
                    {removeButton(
                      option,
                      () => update({ options: draft.options.filter((_, n) => n !== i) }),
                      draft.options.length <= 2,
                    )}
                  </span>
                ))}
              </div>
              <AddRow
                label="New option"
                value={optionDraft}
                onChange={setOptionDraft}
                onAdd={addOption}
                buttonText="Add option"
              />
            </Panel>

            <div className="flex flex-col gap-xs rounded-lg border border-dashed border-border p-md">
              <p className="text-caption font-medium uppercase tracking-wide text-text-secondary">How the student sees it</p>
              <p className="text-body-sm text-text-primary">{draft.entries[0] ?? 'Your first question'}</p>
              <div className="flex flex-wrap gap-xs">
                {draft.options.map((option) => (
                  <span
                    key={option}
                    className="rounded-full border border-border bg-surface px-sm py-0.5 text-caption font-medium text-text-primary"
                  >
                    {option}
                  </span>
                ))}
              </div>
            </div>
          </>
        )}

        {type === 'form_link' && (
          <div className="flex flex-col gap-xs">
            <SelectField
              label="immiNow form"
              id="component-form"
              value={draft.formId}
              onChange={(e) => update({ formId: e.target.value })}
              disabled={forms.isLoading}
            >
              <option value="">{forms.isLoading ? 'Loading forms…' : 'Select a form…'}</option>
              {forms.data?.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name}
                </option>
              ))}
            </SelectField>
            {forms.data?.length === 0 && (
              <p className="text-caption text-text-secondary">No forms exist yet — create one under Forms first.</p>
            )}
          </div>
        )}

        {type === 'file_upload' && (
          <div className="flex flex-col gap-xs">
            <SelectField
              label="Document"
              id="component-document"
              required
              value={draft.documentTypeId}
              onChange={(e) => update({ documentTypeId: e.target.value })}
              disabled={documentTypes.isLoading}
            >
              <option value="" disabled>
                {documentTypes.isLoading ? 'Loading documents…' : 'Choose the document to collect…'}
              </option>
              {documentOptions.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
              <option value={OTHER_DOCUMENT}>Other — not in this list</option>
            </SelectField>
            {draft.documentTypeId === OTHER_DOCUMENT && (
              <TextField
                label="Document name"
                required
                value={draft.label}
                onChange={(e) => update({ label: e.target.value })}
                placeholder="e.g. Visa application form"
              />
            )}
            {chosenDocument?.cardinality === 'instance' && (
              <TextField
                label="Which one? (optional)"
                value={draft.documentDetail}
                onChange={(e) => update({ documentDetail: e.target.value })}
                placeholder="e.g. from your employer"
              />
            )}
            {documentTypes.isError && <p className="text-caption text-error">Could not load the document list.</p>}
          </div>
        )}

        {type === 'weblink' && (
          <div className="flex flex-col gap-md">
            <p className="text-caption text-text-secondary">
              The student taps a button in the Sentpo app and the link opens in their phone&rsquo;s browser
            </p>
            <TextField
              label="Web address"
              type="url"
              required
              value={draft.url}
              onChange={(e) => update({ url: e.target.value })}
              placeholder="https://"
              error={draft.url.trim() && !urlValid ? 'Enter a full address starting with https:// or http://' : undefined}
            />
            <TextField
              label="Button text"
              value={draft.buttonText}
              onChange={(e) => update({ buttonText: e.target.value })}
              placeholder="Open link"
            />
          </div>
        )}
      </div>
    </Modal>
  )
}
