import { Drawer } from '@/components/Drawer'
import { Badge } from '@/components/Badge'
import { MoreRowsNote } from '@/components/MoreRowsNote'
import { formatDate } from '@/lib/time'
import { money } from './money'
import { useFinanceCases, useFinancePayments } from '@/queries/financeDashboard'
import { inr } from '@/lib/money'
import { CASE_STATUS_COLOR as STATUS_COLOR, CASE_STATUS_LABEL as STATUS_LABEL } from './caseStatus'

const PAYMENT_STATUS_COLOR = { declared: 'warning', confirmed: 'success', rejected: 'error' } as const

/**
 * Overview balances table's row drawer (2026-09-11) — a consultancy's own cases and recent
 * payments, compact, so "why does this consultancy owe ₹X" doesn't need a second tab switch.
 */
export function ConsultancyBalanceDrawer({
  consultancyId,
  consultancyName,
  onClose,
}: {
  consultancyId: string | null
  consultancyName?: string
  onClose: () => void
}) {
  const cases = useFinanceCases({ consultancy_id: consultancyId ?? undefined, limit: 50 })
  const payments = useFinancePayments({ consultancy_id: consultancyId ?? undefined, limit: 20 })

  return (
    <Drawer open={consultancyId != null} onClose={onClose} title={consultancyName ?? 'Consultancy'}>
      <div className="flex flex-col gap-lg">
        <div>
          <h3 className="text-body-sm font-medium text-text-primary">Cases</h3>
          <div className="mt-xs flex flex-col gap-xs">
            {cases.isLoading && <p className="text-caption text-text-secondary">Loading…</p>}
            {cases.isError && <p className="text-caption text-error">Could not load cases.</p>}
            {!cases.isLoading && !cases.isError && (cases.data?.items.length ?? 0) === 0 && (
              <p className="text-caption text-text-secondary">No cases.</p>
            )}
            {cases.data?.items.map((c) => (
              <div key={c.id} className="rounded-md border border-border px-sm py-xs">
                <div className="flex items-center justify-between gap-sm">
                  <span className="text-body-sm font-medium text-text-primary">{c.applicant_name}</span>
                  <Badge color={STATUS_COLOR[c.payment_status]}>{STATUS_LABEL[c.payment_status]}</Badge>
                </div>
                <p className="text-caption text-text-secondary">
                  Due {inr(c.due_inr)} · Paid {inr(c.paid_inr)} · Outstanding {inr(c.outstanding_inr)}
                </p>
              </div>
            ))}
            <MoreRowsNote
              shown={cases.data?.items.length ?? 0}
              total={cases.data?.meta?.total}
              hasMore={Boolean(cases.data?.meta?.next_cursor)}
              noun="cases"
              to="/admin/finance-dashboard?tab=cases"
              linkLabel="Search all cases in Finance"
            />
          </div>
        </div>

        <div>
          <h3 className="text-body-sm font-medium text-text-primary">Recent payments</h3>
          <div className="mt-xs flex flex-col gap-xs">
            {payments.isLoading && <p className="text-caption text-text-secondary">Loading…</p>}
            {payments.isError && <p className="text-caption text-error">Could not load payments.</p>}
            {!payments.isLoading && !payments.isError && (payments.data?.items.length ?? 0) === 0 && (
              <p className="text-caption text-text-secondary">No payments yet.</p>
            )}
            {payments.data?.items.map((p) => (
              <div key={p.id} className="rounded-md border border-border px-sm py-xs">
                <div className="flex items-center justify-between gap-sm">
                  <span className="text-body-sm font-medium text-text-primary">{money(p.amount)}</span>
                  <Badge color={PAYMENT_STATUS_COLOR[p.status]}>
                    {p.status === 'declared' ? 'Declared' : p.status === 'confirmed' ? 'Confirmed' : 'Rejected'}
                  </Badge>
                </div>
                <p className="text-caption text-text-secondary">
                  {p.applicant_name ?? 'General'} · declared {formatDate(p.recorded_at)}
                </p>
              </div>
            ))}
            <MoreRowsNote
              shown={payments.data?.items.length ?? 0}
              total={payments.data?.meta?.total}
              hasMore={Boolean(payments.data?.meta?.next_cursor)}
              noun="payments"
              to="/admin/finance-dashboard?tab=history"
              linkLabel="See all payments in Payment history"
            />
          </div>
        </div>
      </div>
    </Drawer>
  )
}
