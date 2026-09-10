// Split out of ConsultancyProfilePage.tsx (Phase 3 plan, Tier B2, 2026-09-03) — pure movement, no logic change.
import { useState, type FormEvent } from 'react'
import { Copy, Plus } from 'lucide-react'
import { Card } from '@/components/Card'
import { Modal } from '@/components/Modal'
import { Button } from '@/components/Button'
import { Badge } from '@/components/Badge'
import { TextField } from '@/components/TextField'
import { useIssueTransferCode, useTransferCodes } from '@/queries/consultancy'
import { Table, type TableColumn } from '@/components/Table'
import { formatDateTime } from '@/lib/time'
import type { components } from '@/api/schema'
import { EMAIL_ERROR, isValidEmail } from '@/lib/validation'

type TransferCode = components['schemas']['TransferCode']

const CODE_STATUS_META: Record<string, { label: string; color: 'success' | 'secondary' | 'warning' }> = {
  active: { label: 'Active', color: 'success' },
  used: { label: 'Used', color: 'secondary' },
  expired: { label: 'Expired', color: 'warning' },
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
  const [studentEmail, setStudentEmail] = useState('')
  const [reason, setReason] = useState('')
  const [copied, setCopied] = useState(false)
  const emailError = studentEmail && !isValidEmail(studentEmail) ? EMAIL_ERROR : undefined
  const canIssue = Boolean(studentEmail.trim()) && !emailError && Boolean(reason.trim())
  const issued = issueCode.isSuccess ? issueCode.data : null

  function handleIssue(e?: FormEvent) {
    e?.preventDefault()
    if (!canIssue) return
    issueCode.mutate({ student_email: studentEmail.trim(), reason: reason.trim() })
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
            For {issued.student_email}. Single use, valid until {formatDateTime(issued.expires_at)}.
          </p>
        </div>
      ) : (
        <form onSubmit={handleIssue} className="flex flex-col gap-md">
          <p className="text-body-sm text-text-secondary">
            Issuing a code is your consent to take the case. It is bound to the student&rsquo;s registered email.
          </p>
          <TextField
            label="Student's registered email"
            required
            type="email"
            value={studentEmail}
            onChange={(e) => setStudentEmail(e.target.value)}
            error={emailError}
          />
          <TextField label="Reason" required value={reason} onChange={(e) => setReason(e.target.value)} />
          {issueCode.isError && <p className="text-body-sm text-error">{issueCode.error.message}</p>}
        </form>
      )}
    </Modal>
  )
}

export function IncomingTransfersTab() {
  const codes = useTransferCodes(true)
  const [issuing, setIssuing] = useState(false)

  const columns: TableColumn<TransferCode>[] = [
    {
      key: 'code',
      header: 'Code',
      render: (c) => <span className="rounded bg-background px-1.5 py-0.5 font-mono font-semibold">{c.code}</span>,
    },
    { key: 'student_email', header: 'Student email', render: (c) => c.student_email },
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
  ]

  return (
    <div className="flex flex-col gap-md">
      <Card className="flex flex-wrap items-start justify-between gap-md">
        <div className="min-w-0 flex-1">
          <h2 className="text-h3 text-text-primary">Accept an incoming transfer</h2>
          <p className="mt-xs text-body-sm text-text-secondary">
            When another consultancy wants to transfer an applicant to you, issue a code here and share it with them —
            they need it to complete the transfer. Issuing a code is your consent to take the case. Codes are single-use
            and expire after 72 hours.
          </p>
        </div>
        <Button onClick={() => setIssuing(true)} className="inline-flex shrink-0 items-center gap-xs">
          <Plus className="h-4 w-4" aria-hidden />
          Issue a code
        </Button>
      </Card>
      {issuing && <IssueCodeModal onClose={() => setIssuing(false)} />}

      <Table
        columns={columns}
        rows={codes.data?.items ?? []}
        rowKey={(c) => c.code}
        loading={codes.isLoading}
        error={codes.isError ? 'Could not load transfer codes.' : undefined}
        emptyMessage="No transfer codes issued yet."
      />
    </div>
  )
}
