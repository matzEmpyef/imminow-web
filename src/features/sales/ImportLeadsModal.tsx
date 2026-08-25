import { useRef, useState, type FormEvent } from 'react'
import { SelectField } from '@/components/SelectField'
import { Modal } from '@/components/Modal'
import { Button } from '@/components/Button'
import { TextField } from '@/components/TextField'
import { useCommitLeadImport, useCreateLead, useValidateLeadImport } from '@/queries/leads'
import { EMAIL_ERROR, PHONE_ERROR, isValidEmail, isValidPhone } from '@/lib/validation'

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
    if (!validate.data) return
    commit.mutate({ batch_id: validate.data.batch_id, source })
  }

  return (
    <Modal
      onClose={onClose}
      title="Import Leads"
      widthRem={32}
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
        Columns: name, phone, email. One header row, one contact per row after that.
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
                  <th className="px-sm py-xs text-left">Status</th>
                </tr>
              </thead>
              <tbody>
                {validate.data.rows.map((row) => (
                  <tr key={row.row_number} className="border-t border-border">
                    <td className="px-sm py-xs">{row.row_number}</td>
                    <td className="px-sm py-xs">{row.name ?? '—'}</td>
                    <td className={`px-sm py-xs ${row.valid ? 'text-success' : 'text-error'}`}>
                      {row.valid ? 'Valid' : row.errors?.join(' ')}
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
        <p className="mt-md text-body-sm text-success">
          {commit.data.created_count} leads imported into the Lead Pool.
        </p>
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

  const phoneError = phone && !isValidPhone(phone) ? PHONE_ERROR : undefined
  const emailError = email && !isValidEmail(email) ? EMAIL_ERROR : undefined
  const canSubmit = Boolean(name) && !phoneError && !emailError

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!canSubmit) return
    createLead.mutate(
      { name, phone: phone || null, email: email || null, source, notes: notes || null },
      {
        onSuccess: () => {
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
          {createLead.isSuccess && (
            <p className="mr-auto self-center text-body-sm text-success">Lead added to the pool.</p>
          )}
          {createLead.isError && (
            <p className="mr-auto self-center text-body-sm text-error">{createLead.error.message}</p>
          )}
          <Button type="submit" form="add-lead-form" loading={createLead.isPending} disabled={!canSubmit}>
            Add Lead
          </Button>
        </>
      }
    >
      <form id="add-lead-form" className="flex flex-col gap-md" onSubmit={handleSubmit}>
        <TextField label="Name" value={name} onChange={(e) => setName(e.target.value)} required />
        <TextField label="Phone" value={phone} onChange={(e) => setPhone(e.target.value)} error={phoneError} />
        <TextField
          label="Email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          error={emailError}
        />
        <SelectField
          label="Source"
          id="manual-source"
          value={source}
          onChange={(e) => setSource(e.target.value as Source)}
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
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            className="rounded-md border border-border bg-surface px-3 py-2 text-body"
          />
        </div>
      </form>
    </Modal>
  )
}
