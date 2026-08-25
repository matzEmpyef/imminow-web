import { useState } from 'react'
import { AdminShell } from '@/features/auth/AdminShell'
import { SelectField } from '@/components/SelectField'
import { Card } from '@/components/Card'
import type { ReactNode } from 'react'
import { Settings } from 'lucide-react'
import { Modal } from '@/components/Modal'
import { Button } from '@/components/Button'
import { Badge } from '@/components/Badge'
import { TextField } from '@/components/TextField'
import { Table, type TableColumn } from '@/components/Table'
import { useAdminConsultancies } from '@/queries/adminConsultancies'
import {
  useEraseUserData,
  useExportUserData,
  useSwitchConsultancy,
  useUpdateUserEmail,
  useUserSearch,
} from '@/queries/supportTools'
import type { components } from '@/api/schema'
import { EMAIL_ERROR, isValidEmail } from '@/lib/validation'

type UserSearchResult = components['schemas']['UserSearchResult']

// --- Support action sections -------------------------------------------------------------
//
// These four were laid out as wide flex-wrap rows because they lived in an expanded TABLE ROW.
// They moved into a popup on 2026-08-23 and the row layout came with them — fields running off
// sideways, no separation between one operation and the next, and nothing anywhere saying what
// any of them actually DOES. Rebuilt as titled sections (user: "make ui better").
//
// The descriptions are the substantive part. Switching and erasing are irreversible operations on
// a real person's account, and an operator was being asked to run them from a bare label.

function ActionSection({
  title,
  description,
  danger = false,
  children,
}: {
  title: string
  description: string
  danger?: boolean
  children: ReactNode
}) {
  return (
    <section
      className={`flex flex-col gap-sm rounded-md border p-md ${
        danger ? 'border-error/40 bg-error/5' : 'border-border'
      }`}
    >
      <div>
        <h3 className={`text-body-sm font-semibold ${danger ? 'text-error' : 'text-text-primary'}`}>{title}</h3>
        <p className="mt-0.5 text-caption text-text-secondary">{description}</p>
      </div>
      {children}
    </section>
  )
}

/** The result line every action shares, so the four cannot drift apart in wording or placement. */
function ActionResult({
  isSuccess,
  isError,
  successText,
  errorText,
}: {
  isSuccess: boolean
  isError: boolean
  successText: string
  errorText?: string
}) {
  if (isSuccess) return <span className="text-caption text-success">{successText}</span>
  if (isError) return <span className="text-caption text-error">{errorText}</span>
  return <span />
}

function SwitchConsultancyAction({ result }: { result: UserSearchResult }) {
  const consultancies = useAdminConsultancies()
  const switchConsultancy = useSwitchConsultancy()
  const [newConsultancyId, setNewConsultancyId] = useState('')
  const [reason, setReason] = useState('')

  // Only a student with an active case has anything to switch.
  if (!result.journey_id) return null

  return (
    <ActionSection
      title="Switch consultancy"
      description="Closes this student's current case and opens a fresh one at the consultancy you pick. The old case stays on file, read-only — nothing is deleted."
    >
      <div className="grid gap-sm sm:grid-cols-2">
        <SelectField
          label="Move to"
          required
          id={`switch-${result.id}`}
          value={newConsultancyId}
          onChange={(e) => setNewConsultancyId(e.target.value)}
        >
          <option value="">Select a consultancy…</option>
          {consultancies.data?.items
            ?.filter((c) => c.name !== result.consultancy_name)
            .map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
        </SelectField>
        <TextField label="Reason" value={reason} onChange={(e) => setReason(e.target.value)} />
      </div>
      <div className="flex items-center justify-between gap-sm">
        <ActionResult
          isSuccess={switchConsultancy.isSuccess}
          isError={switchConsultancy.isError}
          successText="Case moved."
          errorText={switchConsultancy.error?.message}
        />
        <Button
          variant="secondary"
          loading={switchConsultancy.isPending}
          disabled={!newConsultancyId || !reason}
          onClick={() =>
            switchConsultancy.mutate(
              { journeyId: result.journey_id!, new_consultancy_id: newConsultancyId, reason },
              {
                onSuccess: () => {
                  setNewConsultancyId('')
                  setReason('')
                },
              },
            )
          }
        >
          Switch
        </Button>
      </div>
    </ActionSection>
  )
}

function UpdateEmailAction({ result }: { result: UserSearchResult }) {
  const updateEmail = useUpdateUserEmail()
  const [newEmail, setNewEmail] = useState('')
  const [reason, setReason] = useState('')
  const emailError = newEmail && !isValidEmail(newEmail) ? EMAIL_ERROR : undefined

  return (
    <ActionSection
      title="Change sign-in email"
      description={`Replaces ${result.email} as the address they sign in with. They are not asked to confirm it, so check the new one is right.`}
    >
      <div className="grid gap-sm sm:grid-cols-2">
        <TextField
          label="New email"
          type="email"
          value={newEmail}
          onChange={(e) => setNewEmail(e.target.value)}
          error={emailError}
        />
        <TextField label="Reason" value={reason} onChange={(e) => setReason(e.target.value)} />
      </div>
      <div className="flex items-center justify-between gap-sm">
        <ActionResult
          isSuccess={updateEmail.isSuccess}
          isError={updateEmail.isError}
          successText="Email updated."
          errorText={updateEmail.error?.message}
        />
        <Button
          variant="secondary"
          loading={updateEmail.isPending}
          disabled={!newEmail || !reason || Boolean(emailError)}
          onClick={() =>
            updateEmail.mutate(
              { id: result.id!, new_email: newEmail, reason },
              {
                onSuccess: () => {
                  setNewEmail('')
                  setReason('')
                },
              },
            )
          }
        >
          Update Email
        </Button>
      </div>
    </ActionSection>
  )
}

function ExportAction({ result }: { result: UserSearchResult }) {
  const exportData = useExportUserData()

  return (
    <ActionSection
      title="Data export"
      description="Generates a full copy of everything Sentpo holds on this user, for a data-access request. Safe to run — it only reads."
    >
      <div className="flex items-center justify-between gap-sm">
        <ActionResult
          isSuccess={exportData.isSuccess}
          isError={exportData.isError}
          successText="Export queued."
          errorText={exportData.error?.message}
        />
        <Button variant="secondary" loading={exportData.isPending} onClick={() => exportData.mutate(result.id!)}>
          Generate Export
        </Button>
      </div>
    </ActionSection>
  )
}

function EraseAction({ result }: { result: UserSearchResult }) {
  const eraseData = useEraseUserData()
  const [reason, setReason] = useState('')
  const [confirmText, setConfirmText] = useState('')

  return (
    <ActionSection
      danger
      title="Erase user data"
      description="Queues deletion of this user's personal data. It completes after a 30-day window and cannot be undone once that window passes."
    >
      <div className="grid gap-sm sm:grid-cols-2">
        <TextField label="Reason" value={reason} onChange={(e) => setReason(e.target.value)} />
        <TextField
          label={'Type "ERASE" to confirm'}
          value={confirmText}
          onChange={(e) => setConfirmText(e.target.value)}
        />
      </div>
      <div className="flex items-center justify-between gap-sm">
        <ActionResult
          isSuccess={eraseData.isSuccess}
          isError={eraseData.isError}
          successText="Erasure queued — completes in 30 days."
          errorText={eraseData.error?.message}
        />
        <Button
          variant="destructive"
          loading={eraseData.isPending}
          disabled={!reason || confirmText !== 'ERASE'}
          onClick={() =>
            eraseData.mutate(
              { id: result.id!, reason },
              {
                onSuccess: () => {
                  setReason('')
                  setConfirmText('')
                },
              },
            )
          }
        >
          Erase User Data
        </Button>
      </div>
    </ActionSection>
  )
}

// Opened from the row's Settings icon. Was an expanding table row until 2026-08-23 — the last
// row-expansion left in the console, after Manage Consultancies and Redemption Partners made the
// same move.
function ActionsPanel({ result }: { result: UserSearchResult }) {
  return (
    <div className="flex flex-col gap-md">
      {/* Who you are acting on, restated inside the popup. The row that opened it is behind an
          overlay by now, and three of these four actions cannot be undone. */}
      <div className="flex flex-col gap-xs rounded-md bg-background p-md">
        <div className="flex flex-wrap items-center gap-sm">
          <span className="font-medium text-text-primary">{result.name}</span>
          <Badge color="primary" className="capitalize">
            {result.role.replace('_', ' ')}
          </Badge>
          {result.case_stage && <Badge color="info">{result.case_stage.replace(/_/g, ' ')}</Badge>}
        </div>
        <p className="text-body-sm text-text-secondary">
          {result.email}
          {result.phone ? ` · ${result.phone}` : ''}
          {result.consultancy_name ? ` · ${result.consultancy_name}` : ''}
        </p>
      </div>

      <p className="text-caption text-text-secondary">
        Every action below is identity-verified, needs a reason, and is audit-logged.
      </p>

      <SwitchConsultancyAction result={result} />
      <UpdateEmailAction result={result} />
      <ExportAction result={result} />
      <EraseAction result={result} />
    </div>
  )
}

export function SupportToolsPage() {
  const [query, setQuery] = useState('')
  const [submittedQuery, setSubmittedQuery] = useState('')
  const results = useUserSearch(submittedQuery)
  const [actionsFor, setActionsFor] = useState<UserSearchResult | null>(null)

  const columns: TableColumn<UserSearchResult>[] = [
    {
      key: 'name',
      header: 'Name',
      render: (result) => (
        <div className="flex items-center gap-sm">
          <span className="font-medium text-text-primary">{result.name}</span>
          <Badge color="primary" className="capitalize">
            {result.role.replace('_', ' ')}
          </Badge>
          {result.case_stage && <Badge color="info">{result.case_stage.replace(/_/g, ' ')}</Badge>}
        </div>
      ),
    },
    {
      key: 'contact',
      header: 'Contact',
      render: (result) => (
        <span className="text-text-secondary">
          {result.email}
          {result.phone ? ` · ${result.phone}` : ''}
          {result.consultancy_name ? ` · ${result.consultancy_name}` : ''}
        </span>
      ),
    },
    {
      key: 'actions',
      header: '',
      align: 'right',
      render: (result) => (
        <div className="flex justify-end">
          <button
            type="button"
            onClick={() => setActionsFor(result)}
            aria-label={`Support actions for ${result.name}`}
            title="Support actions"
            className="flex h-9 w-9 items-center justify-center rounded-md text-text-secondary hover:bg-background hover:text-text-primary"
          >
            <Settings className="h-4 w-4" />
          </button>
        </div>
      ),
    },
  ]

  return (
    <AdminShell>
      <div className="flex flex-col gap-lg">
        <div>
          <h1 className="text-h1 text-text-primary">Support Tools</h1>
          <p className="text-body-sm text-text-secondary">
            Search any user by name or email — students, staff, and freelancers. Results show name, contact, and case
            stage only, deliberately not commission figures or documents.
          </p>
        </div>

        <Card>
          <form
            onSubmit={(e) => {
              e.preventDefault()
              setSubmittedQuery(query)
            }}
            className="flex items-end gap-sm"
          >
            {/* Widened from 24rem (user, 2026-08-23) — this is the page's only input and it
                takes full email addresses, which the old width truncated mid-domain. */}
            <TextField
              label="Search by name or email"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="flex-1"
            />
            <Button type="submit" disabled={!query.trim()}>
              Search
            </Button>
          </form>
        </Card>

        {submittedQuery && (
          <Table
            columns={columns}
            rows={results.data ?? []}
            rowKey={(result) => result.id!}
            loading={results.isLoading}
            emptyMessage={`No matches for "${submittedQuery}".`}
          />
        )}

        {actionsFor && (
          <Modal onClose={() => setActionsFor(null)} title={`Support Actions — ${actionsFor.name}`} widthRem={42}>
            <ActionsPanel result={actionsFor} />
          </Modal>
        )}
      </div>
    </AdminShell>
  )
}
