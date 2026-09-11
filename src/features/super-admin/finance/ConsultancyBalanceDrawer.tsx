import { Drawer } from '@/components/Drawer'
import { Badge } from '@/components/Badge'
import { formatDate } from '@/lib/time'
import { formatMoneyAmount } from '@/lib/money'
import { useFinanceCases, useFinancePayments } from '@/queries/financeDashboard'

const money = formatMoneyAmount

function inr(n: number | undefined): string {
  return `₹${(n ?? 0).toLocaleString('en-IN')}`
}

const STATUS_COLOR = { unpaid: 'warning', part_paid: 'info', paid: 'success' } as const
const STATUS_LABEL = { unpaid: 'Unpaid', part_paid: 'Part-paid', paid: 'Paid' } as const
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
          </div>
        </div>
      </div>
    </Drawer>
  )
}
