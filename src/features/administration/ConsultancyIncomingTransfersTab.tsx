// Split out of ConsultancyProfilePage.tsx (Phase 3 plan, Tier B2, 2026-09-03) — pure movement, no logic change.
import { useState, type FormEvent } from 'react'
import { Card } from '@/components/Card'
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
export function IncomingTransfersTab() {
  const codes = useTransferCodes(true)
  const issueCode = useIssueTransferCode()
  const [studentEmail, setStudentEmail] = useState('')
  const [reason, setReason] = useState('')
  const emailError = studentEmail && !isValidEmail(studentEmail) ? EMAIL_ERROR : undefined

  function handleIssue(e: FormEvent) {
    e.preventDefault()
    if (!studentEmail.trim() || Boolean(emailError) || !reason.trim()) return
    issueCode.mutate(
      { student_email: studentEmail.trim(), reason: reason.trim() },
      {
        onSuccess: () => {
          setStudentEmail('')
          setReason('')
        },
      },
    )
  }

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
      <Card className="flex flex-col gap-md">
        <div>
          <h2 className="text-h3 text-text-primary">Accept an incoming transfer</h2>
          <p className="mt-xs text-body-sm text-text-secondary">
            When another consultancy wants to transfer an applicant to you, issue a code here and share it with them —
            they need it to complete the transfer. Issuing a code is your consent to take the case. Codes are single-use
            and expire after 72 hours.
          </p>
        </div>
        <form onSubmit={handleIssue} className="flex flex-wrap items-end gap-sm">
          <TextField
            label="Student's registered email"
            required
            type="email"
            value={studentEmail}
            onChange={(e) => setStudentEmail(e.target.value)}
            error={emailError}
            className="max-w-[20rem]"
          />
          <TextField
            label="Reason"
            required
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            className="max-w-[20rem]"
          />
          <Button
            type="submit"
            loading={issueCode.isPending}
            disabled={!studentEmail.trim() || Boolean(emailError) || !reason.trim()}
          >
            Issue Code
          </Button>
          {issueCode.isError && <span className="self-center text-body-sm text-error">{issueCode.error.message}</span>}
        </form>
        {issueCode.isSuccess && issueCode.data && (
          <p className="text-body-sm text-text-primary">
            Code{' '}
            <span className="rounded bg-background px-1.5 py-0.5 font-mono font-semibold">{issueCode.data.code}</span>{' '}
            <span className="text-text-secondary">
              issued for {issueCode.data.student_email} — share it with the sending consultancy. Valid until{' '}
              {formatDateTime(issueCode.data.expires_at)}.
            </span>
          </p>
        )}
      </Card>

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
