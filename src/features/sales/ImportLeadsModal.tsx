import { useRef, useState, type FormEvent } from 'react'
import { SelectField } from '@/components/SelectField'
import { Modal } from '@/components/Modal'
import { Button } from '@/components/Button'
import { TextField } from '@/components/TextField'
import { useCommitLeadImport, useCreateLead, useValidateLeadImport } from '@/queries/leads'
import { EMAIL_ERROR, STAFF_PHONE_SENTENCE, isValidEmail, isValidPhone } from '@/lib/validation'
import { repeatWarningOf } from '@/lib/servedCaseFields'
import { showToast } from '@/lib/toast'
import { ApiError, fieldMessages } from '@/api/errors'

// Contract gate 7, owner Q7 (2026-09-25): duplicates — repeated within the file, or matching an
// existing active imported lead — are skipped rather than failing the whole import, and listed
// with a reason so nothing silently disappears.
const SKIPPED_REASON_LABEL: Record<string, string> = {
  duplicate_in_file: 'Duplicate row in this file',
  already_imported: 'Already an active lead',
}

const SOURCES = [
  { value: 'referral', label: 'Referral' },
  { value: 'website', label: 'Website' },
  { value: 'walk_in', label: 'Walk-in' },
  { value: 'social', label: 'Social' },
  { value: 'other', label: 'Other' },
] as const

type Source = (typeof SOURCES)[number]['value']

// Was its own page (`/sales/import-leads`) — folded into Lead Pool as two separate popups
// (user-requested: "2 buttons.. add lead and import leads"), each doing exactly one thing instead
// of one modal bundling both. Both stay behind the same business/ultimate tier gate the old page
// applied to both together (build reference 2.2 groups CSV import and manual add under one
// "Import Leads (Business & Ultimate)" feature) — LeadPoolPage decides whether to render either
// trigger button at all, so these modals assume they're already allowed to be open.

export function ImportLeadsModal({ onClose }: { onClose: () => void }) {
  const [source, setSource] = useState<Source>('other')
  const [dragOver, setDragOver] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const validate = useValidateLeadImport()
  const commit = useCommitLeadImport()

  function handleFile(file: File | undefined) {
    if (!file) return
    commit.reset()
    validate.mutate(file)
  }

  function handleCommit() {
    // T3: a double-click before the button disabled committed the batch twice (two keys, two
    // imports). The key is batch-derived now, but the guard stops the second request outright.
    if (commit.isPending) return
    if (!validate.data) return
    commit.mutate({ batch_id: validate.data.batch_id, source })
  }

  return (
    <Modal
      onClose={onClose}
      title="Import Leads"
      widthRem={40}
      footer={
        validate.data &&
        !commit.isSuccess && (
          <>
            {commit.isError && <p className="mr-auto self-center text-body-sm text-error">{commit.error.message}</p>}
            <Button onClick={handleCommit} loading={commit.isPending} disabled={validate.data.valid_count === 0}>
              Import {validate.data.valid_count} Leads
            </Button>
          </>
        )
      }
    >
      <p className="text-body-sm text-text-secondary">
        Your file needs three columns: name, phone and email. The first row holds the column headings. Each row after it is one person.
      </p>

      <div
        onDragOver={(e) => {
          e.preventDefault()
          setDragOver(true)
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault()
          setDragOver(false)
          handleFile(e.dataTransfer.files[0])
        }}
        onClick={() => fileInputRef.current?.click()}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            fileInputRef.current?.click()
          }
        }}
        className={`mt-md flex h-28 cursor-pointer flex-col items-center justify-center rounded-md border-2 border-dashed text-body-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary ${
          dragOver ? 'border-primary bg-background' : 'border-border text-text-secondary'
        }`}
      >
        <p>Drag and drop a CSV file, or click to browse</p>
        <input
          ref={fileInputRef}
          type="file"
          accept=".csv"
          className="hidden"
          onChange={(e) => handleFile(e.target.files?.[0])}
        />
      </div>

      {validate.isPending && <p className="mt-md text-body-sm text-text-secondary">Validating…</p>}

      {validate.data && !commit.isSuccess && (
        <div className="mt-md flex flex-col gap-md">
          <p className="text-body-sm text-text-primary">
            {validate.data.valid_count} valid, {validate.data.invalid_count} invalid of {validate.data.rows.length}{' '}
            rows.
          </p>
          <div className="max-h-48 overflow-auto rounded-md border border-border">
            <table className="w-full text-body-sm">
              <thead className="bg-background text-caption text-text-secondary">
                <tr>
                  <th className="px-sm py-xs text-left">Row</th>
                  <th className="px-sm py-xs text-left">Name</th>
                  <th className="px-sm py-xs text-left">Phone and email</th>
                  <th className="px-sm py-xs text-left">Status</th>
                </tr>
              </thead>
              <tbody>
                {validate.data.rows.map((row) => (
                  <tr key={row.row_number} className="border-t border-border">
                    <td className="px-sm py-xs">{row.row_number}</td>
                    <td className="px-sm py-xs">{row.name ?? '—'}</td>
                    {/* As the server sends them back (review F-208): for a valid row these are
                        the values that will be stored, the phone in international form and the
                        email in lower case. */}
                    <td className="px-sm py-xs text-text-secondary">
                      {row.phone || row.email ? (
                        <span className="flex flex-col">
                          {row.phone && <span>{row.phone}</span>}
                          {row.email && <span className="break-all">{row.email}</span>}
                        </span>
                      ) : (
                        '—'
                      )}
                    </td>
                    {/* A row that cannot be imported says why, in the server's own words. */}
                    <td className={`px-sm py-xs ${row.valid ? 'text-success' : 'text-error'}`}>
                      {row.valid ? 'Valid' : row.errors?.length ? row.errors.join(' ') : 'This row cannot be imported.'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <SelectField
            label="Source"
            id="import-source"
            value={source}
            onChange={(e) => setSource(e.target.value as Source)}
          >
            {SOURCES.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </SelectField>
        </div>
      )}

      {commit.isSuccess && (
        <div className="mt-md flex flex-col gap-sm">
          <p className="text-body-sm text-success">
            {commit.data.created_count} leads imported into the Lead Pool.
          </p>
          {commit.data.skipped.length > 0 && (
            <div className="flex flex-col gap-xs">
              <p className="text-body-sm text-text-primary">
                {commit.data.skipped.length} row{commit.data.skipped.length === 1 ? '' : 's'} skipped —
                already there, so nothing was overwritten.
              </p>
              <div className="max-h-40 overflow-auto rounded-md border border-border">
                <table className="w-full text-body-sm">
                  <thead className="bg-background text-caption text-text-secondary">
                    <tr>
                      <th className="px-sm py-xs text-left">Row</th>
                      <th className="px-sm py-xs text-left">Name</th>
                      <th className="px-sm py-xs text-left">Reason</th>
                    </tr>
                  </thead>
                  <tbody>
                    {commit.data.skipped.map((row) => (
                      <tr key={row.row_number} className="border-t border-border">
                        <td className="px-sm py-xs">{row.row_number}</td>
                        <td className="px-sm py-xs">
                          {validate.data?.rows.find((r) => r.row_number === row.row_number)?.name ?? '—'}
                        </td>
                        <td className="px-sm py-xs text-text-secondary">
                          {SKIPPED_REASON_LABEL[row.reason] ?? row.reason}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}
    </Modal>
  )
}

export function AddLeadModal({ onClose }: { onClose: () => void }) {
  const createLead = useCreateLead()
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [source, setSource] = useState<Source>('referral')
  const [notes, setNotes] = useState('')

  // The server checks the contact as it checks an import row (review F-208, 2026-10-08) and
  // names each field it refuses (400, `details.fields`). Its sentence sits beside that field
  // until the field is changed; `sent` is what the refused request carried.
  const [sent, setSent] = useState<{ name: string; phone: string; email: string } | null>(null)
  // What the server stored for the last lead added: the phone comes back in international form
  // (a number typed without a country code is read in the consultancy's own country).
  const [stored, setStored] = useState<{ name: string; phone: string } | null>(null)
  // The server's "this may be a repeat" (T4-18): the lead WAS added, so it is a note, never a stop.
  const [warning, setWarning] = useState<string | null>(null)
  const refused = fieldMessages(createLead.error)
  const serverError = (field: 'name' | 'phone' | 'email', value: string) =>
    sent && sent[field] === value ? refused[field] : undefined
  // "Give an email address or a phone number…" names no field: it is the answer to a form sent with
  // neither, so it stands beside the contact fields until one of them is filled in.
  const refusedForNoContact =
    createLead.error instanceof ApiError &&
    createLead.error.code === 'validation_failed' &&
    sent !== null &&
    !sent.phone &&
    !sent.email &&
    Object.keys(refused).length === 0
  const noContactError = refusedForNoContact && !phone && !email ? createLead.error.message : undefined
  // A refusal that named a field, or that said a contact was missing, is never repeated in the footer
  // once its field has been edited.
  const refusedBesideAField = Object.keys(refused).length > 0 || refusedForNoContact

  const nameError = serverError('name', name)
  const phoneError = (phone && !isValidPhone(phone) ? STAFF_PHONE_SENTENCE : undefined) ?? serverError('phone', phone)
  const emailError =
    (email && !isValidEmail(email) ? EMAIL_ERROR : undefined) ?? serverError('email', email) ?? noContactError
  const shownBesideAField = Boolean(nameError || phoneError || emailError)
  const canSubmit = Boolean(name) && !phoneError && !emailError && !nameError

  // The "added" line belongs to the lead just added: it goes as soon as the next one is begun.
  const edits = (set: (value: string) => void) => (e: { target: { value: string } }) => {
    setStored(null)
    setWarning(null)
    set(e.target.value)
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setStored(null)
    setWarning(null)
    if (!canSubmit) return
    setSent({ name, phone, email })
    createLead.mutate(
      { name, phone: phone || null, email: email || null, source, notes: notes || null },
      {
        onSuccess: (lead) => {
          showToast('Lead added to the pool')
          if (lead?.phone) setStored({ name: lead.name ?? name, phone: lead.phone })
          setWarning(repeatWarningOf(lead))
          setSent(null)
          setName('')
          setPhone('')
          setEmail('')
          setNotes('')
        },
      },
    )
  }

  return (
    <Modal
      onClose={onClose}
      title="Add Lead"
      widthRem={26}
      footer={
        <>
          {createLead.isError && !shownBesideAField && !refusedBesideAField && (
            <p className="mr-auto self-center text-body-sm text-error">{createLead.error.message}</p>
          )}
          <Button type="submit" form="add-lead-form" loading={createLead.isPending} disabled={!canSubmit}>
            Add Lead
          </Button>
        </>
      }
    >
      <form id="add-lead-form" className="flex flex-col gap-md" onSubmit={handleSubmit}>
        {(stored || warning) && (
          <div role="status" className="flex flex-col gap-xs">
            {stored && (
              <p className="rounded-md bg-success-subtle px-3 py-sm text-body-sm text-text-primary">
                {stored.name} added. Phone saved as <span className="font-medium tabular-nums">{stored.phone}</span>.
              </p>
            )}
            {warning && (
              <p className="rounded-md bg-warning-subtle px-3 py-sm text-body-sm text-text-primary">{warning}</p>
            )}
          </div>
        )}
        <TextField label="Name" value={name} onChange={edits(setName)} required error={nameError} />
        <TextField label="Phone" value={phone} onChange={edits(setPhone)} error={phoneError} hint={STAFF_PHONE_SENTENCE} />
        <TextField
          label="Email"
          type="email"
          value={email}
          onChange={edits(setEmail)}
          error={emailError}
        />
        <SelectField
          label="Source"
          id="manual-source"
          value={source}
          onChange={edits((value) => setSource(value as Source))}
        >
          {SOURCES.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </SelectField>
        <div className="flex flex-col gap-xs">
          <label className="text-body-sm font-medium text-text-primary" htmlFor="manual-notes">
            Notes
          </label>
          <textarea
            id="manual-notes"
            value={notes}
            onChange={edits(setNotes)}
            rows={3}
            className="rounded-md border border-border bg-surface px-3 py-sm text-body"
          />
        </div>
      </form>
    </Modal>
  )
}
