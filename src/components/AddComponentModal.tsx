import { useState } from 'react'
import { X } from 'lucide-react'
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

// The "Other — not in this list" choice for a File Upload: no catalog document, the Label says
// what is wanted. Also what an older File Upload (made before the dropdown) opens as.
const OTHER_DOCUMENT = 'other'

function htmlHasText(html: string): boolean {
  return html.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').trim().length > 0
}

// User-requested — "just like a WordPress page setup.. the already mentioned components can be
// added multiple times... Don't want a checkbox to select which component." Replaces the old
// fixed checkbox set (0 or 1 of each type, baked into a single "Add Step" action) with a
// repeatable popup: click "Add Component" as many times as you want, even for the same type —
// each instance gets its own Label so multiple "File Upload" components are distinguishable.
// Doubles as the Edit Component popup when `editingComponent` is supplied, same pre-fill +
// title/button-swap pattern as every other Add/Edit popup this session. Shared between Plan
// Templates and the live client Plan editor.
//
// Type/Label alone left no way to actually enter a text component's content, a checklist's
// items, a questionnaire's questions, or which form a form_link points to — user-reported ("I
// don't see any place to enter the text... Form link, how do I select the form!!") — so each
// type now gets its own payload field below the Type/Label row: a content textarea for `text`,
// an add-and-list builder (shared between checklist items and questionnaire questions, since
// they're structurally identical string lists), and a form picker sourced from `useFormTemplates`
// for `form_link`. `file_upload` picks which catalog document it collects (2026-09-10).
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
  const payload = readPayload(editingComponent)
  const [type, setType] = useState<ComponentType>(editingComponent?.type ?? 'text')
  const [label, setLabel] = useState(editingComponent?.label ?? '')
  // Rich text (user, 2026-09-10: "i want rich text also"), stored as HTML with format 'html'.
  const [content, setContent] = useState(() => {
    const raw = typeof payload.content === 'string' ? payload.content : ''
    return payload.format === 'html' ? raw : plainToHtml(raw)
  })
  const [entries, setEntries] = useState<string[]>(
    Array.isArray(payload.items)
      ? (payload.items as string[])
      : Array.isArray(payload.questions)
        ? (payload.questions as string[])
        : [],
  )
  const [entryDraft, setEntryDraft] = useState('')
  // Answer options for a questionnaire (2026-08-23). Yes/No was hardcoded in the app until now,
  // so an existing component has no `options` key — it falls back to that same pair, and this
  // seeds the editor with it so nobody has to retype the common case.
  const [options, setOptions] = useState<string[]>(
    Array.isArray(payload.options) && (payload.options as string[]).length >= 2
      ? (payload.options as string[])
      : ['Yes', 'No'],
  )
  const [optionDraft, setOptionDraft] = useState('')

  function addOption() {
    const next = optionDraft.trim()
    if (!next || options.includes(next)) return
    setOptions((prev) => [...prev, next])
    setOptionDraft('')
  }
  // `form_template_id` is the CONTRACT key (openapi.yaml Component.payload; the mobile app and
  // mock server both read it). `form_id` is the legacy key this modal briefly wrote before the
  // drift was caught (2026-08-20 — "I cannot see the Form associated with the plan") — read as a
  // fallback so old components stay editable, but never written again.
  const [formId, setFormId] = useState(
    typeof payload.form_template_id === 'string'
      ? payload.form_template_id
      : typeof payload.form_id === 'string'
        ? payload.form_id
        : '',
  )

  const forms = useFormTemplates()

  // Web Link (2026-09-10): the address the student's phone opens in its browser, and optional
  // wording for the button ("Open link" when left blank).
  const [url, setUrl] = useState(typeof payload.url === 'string' ? payload.url : '')
  const [buttonText, setButtonText] = useState(typeof payload.button_text === 'string' ? payload.button_text : '')
  const urlValid = isHttpUrl(url)

  // File Upload names WHICH document it collects (user, 2026-09-10: "I thought we will be
  // selecting from a dropdown the name of the file"), from the document catalog — the platform's
  // shared list plus this consultancy's own. payload.document_type_id is what lets the Sentpo app
  // show that document's instructions and offer a copy the student already uploaded.
  const documentTypes = useDocumentTypes()
  const documentOptions = documentTypes.data?.items ?? []
  const [documentTypeId, setDocumentTypeId] = useState(
    typeof payload.document_type_id === 'string'
      ? payload.document_type_id
      : editingComponent?.type === 'file_upload'
        ? OTHER_DOCUMENT
        : '',
  )
  const chosenDocument = documentOptions.find((t) => t.id === documentTypeId)

  function chooseDocument(id: string) {
    const previousName = documentOptions.find((t) => t.id === documentTypeId)?.name
    const nextName = documentOptions.find((t) => t.id === id)?.name
    // Fill the Label with the document's name, unless the consultant has written their own.
    if (nextName && (!label.trim() || label === previousName)) setLabel(nextName)
    setDocumentTypeId(id)
  }

  function addEntry() {
    if (!entryDraft) return
    setEntries((prev) => [...prev, entryDraft])
    setEntryDraft('')
  }

  function removeEntry(index: number) {
    setEntries((prev) => prev.filter((_, i) => i !== index))
  }

  function buildPayload(): Record<string, unknown> {
    switch (type) {
      case 'text':
        return { content, format: 'html' }
      case 'checklist':
        return { items: entries }
      case 'questionnaire':
        return { questions: entries, options }
      case 'form_link': {
        if (!formId) return {}
        const form = forms.data?.find((f) => f.id === formId)
        // `form_name` is a display convenience only; `form_template_id` is what the contract,
        // the mobile app, and the Forms tab all key on.
        return { form_template_id: formId, form_name: form?.name ?? '' }
      }
      case 'weblink':
        return buttonText.trim() ? { url: url.trim(), button_text: buttonText.trim() } : { url: url.trim() }
      case 'file_upload':
        // `document_type_name` is display only (builder row, preview); the id is what counts.
        return chosenDocument ? { document_type_id: chosenDocument.id, document_type_name: chosenDocument.name } : {}
      default:
        return {}
    }
  }

  // User-requested — "In Type Text.. change Label to Title (Title should not be mandatory)."
  // Every other type keeps "Label" and stays required; a plain instructional paragraph doesn't
  // always need a heading, so `text` alone gets the relaxed rule.
  // Text has no label at all (user, 2026-09-10: "No need of label for Text component"); it needs
  // content instead. Every other type keeps a required Label.
  const labelRequired = type !== 'text'
  const canSubmit =
    !(labelRequired && !label) &&
    (type !== 'weblink' || urlValid) &&
    (type !== 'text' || htmlHasText(content)) &&
    (type !== 'file_upload' || Boolean(documentTypeId))

  function handleSubmit() {
    if (!canSubmit) return
    onSubmit({
      id: editingComponent?.id ?? newComponentId(),
      type,
      label: type === 'text' ? '' : label,
      payload: buildPayload(),
    })
    onClose()
  }

  const entryNoun = type === 'checklist' ? 'item' : 'question'

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
          onChange={(e) => setType(e.target.value as ComponentType)}
        >
          {COMPONENT_TYPES.map((t) => (
            <option key={t} value={t}>
              {COMPONENT_TYPE_LABELS[t]}
            </option>
          ))}
        </SelectField>

        {type !== 'text' && <TextField label="Label" value={label} onChange={(e) => setLabel(e.target.value)} />}

        {type === 'text' && (
          <div className="flex flex-col gap-xs">
            <p className="text-body-sm font-medium text-text-primary">Content to display</p>
            <RichTextEditor
              value={content}
              onChange={setContent}
              minHeightRem={10}
              ariaLabel="Content to display"
              placeholder="Instructions, notes, anything the student should read in this step…"
            />
          </div>
        )}

        {(type === 'checklist' || type === 'questionnaire') && (
          <div className="flex flex-col gap-xs">
            <p className="text-body-sm font-medium text-text-primary">
              {type === 'checklist' ? 'Checklist items' : 'Questions'}
            </p>
            {entries.length === 0 && <p className="text-caption text-text-secondary">None added yet.</p>}
            {entries.length > 0 && (
              <div className="flex flex-col gap-xs">
                {entries.map((entry, i) => (
                  <div
                    key={i}
                    className="flex items-center gap-xs rounded-md border border-border bg-background px-sm py-xs"
                  >
                    <span className="min-w-0 flex-1 truncate text-body-sm text-text-primary">{entry}</span>
                    <button
                      type="button"
                      onClick={() => removeEntry(i)}
                      aria-label={`Remove ${entry}`}
                      className="text-text-secondary hover:text-error"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}
            <div className="flex items-end gap-sm">
              <TextField
                label={type === 'checklist' ? 'Item' : 'Question'}
                value={entryDraft}
                onChange={(e) => setEntryDraft(e.target.value)}
              />
              <Button type="button" variant="secondary" onClick={addEntry} disabled={!entryDraft}>
                Add {entryNoun === 'item' ? 'Item' : 'Question'}
              </Button>
            </div>
          </div>
        )}

        {type === 'questionnaire' && (
          <div className="flex flex-col gap-xs">
            <p className="text-body-sm font-medium text-text-primary">Answer options</p>
            <p className="text-caption text-text-secondary">
              Every question in this component uses the same options. Two minimum — the app falls back to Yes/No if
              fewer are saved.
            </p>
            <div className="flex flex-wrap gap-xs">
              {options.map((option, i) => (
                <span
                  key={i}
                  className="flex items-center gap-xs rounded-full border border-border bg-background px-sm py-xs text-body-sm text-text-primary"
                >
                  {option}
                  <button
                    type="button"
                    // Never below two: one option is not a question, it is a statement.
                    disabled={options.length <= 2}
                    onClick={() => setOptions((prev) => prev.filter((_, n) => n !== i))}
                    aria-label={`Remove ${option}`}
                    className="text-text-secondary hover:text-error disabled:opacity-30"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </span>
              ))}
            </div>
            <div className="flex items-end gap-sm">
              <TextField
                label="Add an option"
                value={optionDraft}
                onChange={(e) => setOptionDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    addOption()
                  }
                }}
                className="flex-1"
              />
              <Button variant="secondary" onClick={addOption} disabled={!optionDraft.trim()}>
                Add
              </Button>
            </div>
          </div>
        )}

        {type === 'form_link' && (
          <div className="flex flex-col gap-xs">
            <SelectField
              label="Form to link"
              id="component-form"
              value={formId}
              onChange={(e) => setFormId(e.target.value)}
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
              value={documentTypeId}
              onChange={(e) => chooseDocument(e.target.value)}
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
            {chosenDocument ? (
              <p className="text-caption text-text-secondary">
                {chosenDocument.description ? `${chosenDocument.description} ` : ''}
                {chosenDocument.cardinality === 'singleton'
                  ? 'A student who has already uploaded this can reuse it.'
                  : 'The student uploads a fresh file each time.'}
              </p>
            ) : documentTypeId === OTHER_DOCUMENT ? (
              <p className="text-caption text-text-secondary">Use the Label to say which document you need.</p>
            ) : null}
            {documentTypes.isError && <p className="text-caption text-error">Could not load the document list.</p>}
          </div>
        )}

        {type === 'weblink' && (
          <div className="flex flex-col gap-md">
            <p className="text-caption text-text-secondary">
              The student taps a button in the Sentpo app and the link opens in their phone&rsquo;s browser — a visa
              portal, a college application page, a fee payment page.
            </p>
            <TextField
              label="Web address"
              type="url"
              required
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://"
              error={url.trim() && !urlValid ? 'Enter a full address starting with https:// or http://' : undefined}
            />
            <TextField
              label="Button text"
              value={buttonText}
              onChange={(e) => setButtonText(e.target.value)}
              placeholder="Open link"
            />
          </div>
        )}
      </div>
    </Modal>
  )
}
