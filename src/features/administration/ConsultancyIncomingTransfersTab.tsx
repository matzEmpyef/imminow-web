// Split out of ConsultancyProfilePage.tsx (Phase 3 plan, Tier B2, 2026-09-03) — pure movement, no logic change.
import { useState, type FormEvent } from 'react'
import { Copy, Plus } from 'lucide-react'
import { Card } from '@/components/Card'
import { Modal } from '@/components/Modal'
import { Button } from '@/components/Button'
import { Badge } from '@/components/Badge'
import { TextField } from '@/components/TextField'
import { SegmentedControl } from '@/components/SegmentedControl'
import { useIssueTransferCode, useTransferCodes, useWithdrawTransferCode } from '@/queries/consultancy'
import { Table, type TableColumn } from '@/components/Table'
import { useCursorPagination } from '@/lib/pagination'
import { formatDateTime } from '@/lib/time'
import type { components } from '@/api/schema'
import { showToast } from '@/lib/toast'
import { STAFF_PHONE_SENTENCE, emailError as checkEmail, isTextOk, normaliseEmail, phoneError as checkPhone, phoneToSend } from '@/lib/validation'
import { usePhoneRegion } from '@/lib/phoneRegion'

type TransferCode = components['schemas']['TransferCode']

const CODE_STATUS_META: Record<string, { label: string; color: 'success' | 'secondary' | 'warning' }> = {
  active: { label: 'Active', color: 'success' },
  used: { label: 'Used', color: 'secondary' },
  expired: { label: 'Expired', color: 'warning' },
  withdrawn: { label: 'Withdrawn', color: 'secondary' },
}

// Incoming Transfers (build reference 1.18, reworked 2026-08-20 — "Transfer code should come
// from receiving consultancy... do not involve immiNow admin"): THIS consultancy mints the
// one-time code that lets another consultancy transfer a student in. Issuing a code is this
// consultancy's consent to accept the case, which is why it lives here and not in any admin
// console. The code is bound to the student's registered email — the only cross-tenant key the
// receiving side has.
// Issuing a code happens in a popup (user, 2026-09-10: "use popup to add not inline"). The popup
// then turns into the result — the code, large, with Copy — because the code is the one thing the
// consultant has to carry away from this screen and hand to the other consultancy.
function IssueCodeModal({ onClose }: { onClose: () => void }) {
  const issueCode = useIssueTransferCode()
  // Exactly one of email/phone binds the code (contract gate 7, erd Open 35, owner 2026-09-25) —
  // a phone-only student has no email to key it on. No dedicated country-code phone input exists
  // elsewhere in the console (checked CreateApplicantModal/EditEmployeeModal's own plain phone
  // TextField), so this reuses that same TextField with an E.164-specific validator and example.
  const [identifierKind, setIdentifierKind] = useState<'email' | 'phone'>('email')
  const [studentEmail, setStudentEmail] = useState('')
  const [studentPhone, setStudentPhone] = useState('')
  const [reason, setReason] = useState('')
  const [copied, setCopied] = useState(false)
  const region = usePhoneRegion()
  const emailError = checkEmail(studentEmail)
  const phoneError = checkPhone(studentPhone, region)
  const reasonOk = isTextOk('reason', reason)
  const canIssue =
    identifierKind === 'email'
      ? Boolean(studentEmail.trim()) && !emailError && reasonOk
      : Boolean(studentPhone.trim()) && !phoneError && reasonOk
  const issued = issueCode.isSuccess ? issueCode.data : null

  function handleIssue(e?: FormEvent) {
    e?.preventDefault()
    if (!canIssue) return
    issueCode.mutate(
      identifierKind === 'email'
        ? { studentEmail: normaliseEmail(studentEmail), reason: reason.trim() }
        : { studentPhone: phoneToSend(studentPhone, region), reason: reason.trim() },
    )
  }

  async function copy(code: string) {
    try {
      await navigator.clipboard.writeText(code)
      setCopied(true)
    } catch {
      setCopied(false)
    }
  }

  return (
    <Modal
      onClose={onClose}
      title={issued ? 'Transfer code issued' : 'Issue a transfer code'}
      widthRem={28}
      footer={
        issued ? (
          <Button onClick={onClose}>Done</Button>
        ) : (
          <div className="flex justify-end gap-sm">
            <Button variant="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button onClick={() => handleIssue()} loading={issueCode.isPending} disabled={!canIssue}>
              Issue code
            </Button>
          </div>
        )
      }
    >
      {issued ? (
        <div className="flex flex-col items-center gap-md text-center">
          <p className="text-body-sm text-text-secondary">Share this code with the sending consultancy.</p>
          <span className="rounded-lg bg-background px-lg py-sm font-mono text-h1 font-semibold tracking-wider text-text-primary">
            {issued.code}
          </span>
          <Button variant="secondary" size="sm" onClick={() => copy(issued.code)} className="inline-flex items-center gap-xs">
            <Copy className="h-3.5 w-3.5" aria-hidden />
            {copied ? 'Copied' : 'Copy code'}
          </Button>
          <p className="text-caption text-text-secondary">
            For {issued.student_email ?? issued.student_phone}. Single use, valid until{' '}
            {formatDateTime(issued.expires_at)}.
          </p>
        </div>
      ) : (
        <form onSubmit={handleIssue} className="flex flex-col gap-md">
          <p className="text-body-sm text-text-secondary">
            Issuing a code is your consent to take the case. It is bound to the student&rsquo;s registered email or
            phone number.
          </p>
          <SegmentedControl
            label="Identify the student by"
            value={identifierKind}
            onChange={setIdentifierKind}
            options={[
              { value: 'email', label: 'Email' },
              { value: 'phone', label: 'Phone' },
            ]}
          />
          {identifierKind === 'email' ? (
            <TextField
              label="Student's registered email"
              required
              type="email"
              value={studentEmail}
              onChange={(e) => setStudentEmail(e.target.value)}
              error={emailError}
            />
          ) : (
            <TextField
              label="Student's registered phone"
              required
              type="tel"
              placeholder="+919876543210"
              value={studentPhone}
              onChange={(e) => setStudentPhone(e.target.value)}
              phoneRegion={region}
              error={phoneError}
              hint={STAFF_PHONE_SENTENCE}
            />
          )}
          <TextField kind="reason" label="Reason" required value={reason} onChange={(e) => setReason(e.target.value)} />
          <p className="-mt-sm pl-lg text-caption text-text-secondary">
            Describe the reason in general terms. Please leave out the student's name and contact details.
          </p>
          {issueCode.isError && <p className="text-body-sm text-error">{issueCode.error.message}</p>}
        </form>
      )}
    </Modal>
  )
}

// Taking back a code nobody has used yet. Asks first: the sending consultancy that tries it
// afterwards is told it was withdrawn. A refusal (for example, the code was used in the meantime)
// shows the sentence the server gave.
function WithdrawCodeModal({ code, onClose }: { code: string; onClose: () => void }) {
  const withdraw = useWithdrawTransferCode()
  return (
    <Modal
      onClose={onClose}
      title="Withdraw transfer code"
      widthRem={24}
      footer={
        <>
          {withdraw.isError && <p className="mr-auto self-center text-body-sm text-error">{withdraw.error.message}</p>}
          <div className="flex justify-end gap-sm">
            <Button variant="secondary" onClick={onClose}>
              Keep code
            </Button>
            <Button
              variant="destructive"
              loading={withdraw.isPending}
              onClick={() =>
                withdraw.mutate(code, {
                  onSuccess: () => {
                    showToast(`Code ${code} withdrawn`)
                    onClose()
                  },
                })
              }
            >
              Withdraw
            </Button>
          </div>
        </>
      }
    >
      <p className="text-body-sm text-text-secondary">
        Withdraw code <span className="font-mono font-semibold text-text-primary">{code}</span>? It can no longer bring
        a student in. The consultancy you gave it to will be told to ask you for a new one.
      </p>
    </Modal>
  )
}

export function IncomingTransfersTab({ isInstitute = false }: { isInstitute?: boolean }) {
  const paging = useCursorPagination()
  const codes = useTransferCodes(true, { cursor: paging.cursor, limit: 20 })
  const [issuing, setIssuing] = useState(false)
  const [withdrawing, setWithdrawing] = useState<string | null>(null)

  const columns: TableColumn<TransferCode>[] = [
    {
      key: 'code',
      header: 'Code',
      render: (c) => <span className="rounded bg-background px-1.5 py-0.5 font-mono font-semibold">{c.code}</span>,
    },
    {
      key: 'student',
      header: 'Student',
      // Bound to exactly one of email/phone (contract gate 7, erd Open 35) — the other is null.
      // Both null: the student's contact was removed afterwards (second erasure review). Not an
      // error and not blank; such a code reads `expired`.
      render: (c) =>
        c.student_email ?? c.student_phone ?? <span className="text-text-secondary">Contact removed</span>,
    },
    {
      key: 'status',
      header: 'Status',
      render: (c) => {
        const meta = CODE_STATUS_META[c.status] ?? { label: c.status, color: 'secondary' as const }
        return <Badge color={meta.color}>{meta.label}</Badge>
      },
    },
    { key: 'expires_at', header: 'Expires', render: (c) => formatDateTime(c.expires_at) },
    { key: 'created_at', header: 'Issued', render: (c) => formatDateTime(c.created_at) },
    {
      key: 'actions',
      header: '',
      // Only a code nobody has used and that is still open can be taken back.
      render: (c) =>
        c.status === 'active' ? (
          <div className="flex justify-end">
            <Button variant="secondary" size="sm" onClick={() => setWithdrawing(c.code)}>
              Withdraw
            </Button>
          </div>
        ) : null,
    },
  ]

  return (
    <div className="flex flex-col gap-md">
      <Card className="flex flex-wrap items-start justify-between gap-md">
        <div className="min-w-0 flex-1">
          {isInstitute ? (
            <>
              {/* Receiving is open to every plan, but not to an institute account: the server
                  refuses it a code ("A university account cannot receive transferred students."),
                  so there is no Issue action here. */}
              <h2 className="text-h3 text-text-primary">Incoming transfers</h2>
              <p className="mt-xs text-body-sm text-text-secondary">
                An institute cannot receive students transferred from a consultancy, so there is no code to issue here.
              </p>
            </>
          ) : (
            <>
              <h2 className="text-h3 text-text-primary">Accept an incoming transfer</h2>
              <p className="mt-xs text-body-sm text-text-secondary">
                When another consultancy wants to transfer an applicant to you, issue a code here and share it with
                them — they need it to complete the transfer. Issuing a code is your consent to take the case. Codes
                are single-use and expire after 72 hours.
              </p>
            </>
          )}
        </div>
        {!isInstitute && (
          <Button onClick={() => setIssuing(true)} className="inline-flex shrink-0 items-center gap-xs">
            <Plus className="h-4 w-4" aria-hidden />
            Issue a code
          </Button>
        )}
      </Card>
      {issuing && !isInstitute && <IssueCodeModal onClose={() => setIssuing(false)} />}
      {withdrawing && <WithdrawCodeModal code={withdrawing} onClose={() => setWithdrawing(null)} />}

      <Table
        columns={columns}
        rows={codes.data?.items ?? []}
        rowKey={(c) => c.code}
        loading={codes.isLoading}
        error={codes.isError ? 'Could not load transfer codes.' : undefined} errorSource={codes.error}
        emptyMessage="No transfer codes issued yet."
        pagination={{
          hasNext: Boolean(codes.data?.meta?.next_cursor),
          hasPrevious: paging.hasPrevious,
          onNext: () => codes.data?.meta?.next_cursor && paging.next(codes.data.meta.next_cursor),
          onPrevious: paging.previous,
          total: codes.data?.meta?.total,
        }}
      />
    </div>
  )
}
