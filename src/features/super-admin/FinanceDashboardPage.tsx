import { useState } from 'react'
import { AdminShell } from '@/features/auth/AdminShell'
import { SelectField } from '@/components/SelectField'
import { Card } from '@/components/Card'
import { Badge } from '@/components/Badge'
import { Button } from '@/components/Button'
import { TextField } from '@/components/TextField'
import { useAdminConsultancies } from '@/queries/adminConsultancies'
import { useFinanceDashboard, type FinanceDashboardFilters } from '@/queries/financeDashboard'
import { useConfirmCommissionPayment } from '@/queries/commission'
import { formatDate } from '@/lib/time'
import { Skeleton } from '@/components/QueryState'
import type { components } from '@/api/schema'

type CommissionPayment = components['schemas']['CommissionPayment']

const money = (m: { amount?: number | null; currency: string } | undefined) =>
  m ? `${m.currency} ${(m.amount ?? 0).toLocaleString()}` : '—'

// One declared/confirmed payment row — shared by the confirm queue and the history list so the
// two read identically. Reworked 2026-08-28: no more proof link (payments are now per-case and
// need no proof upload) — shows which case it was for (applicant name via the linked entry,
// "General" for legacy pooled payments) and the consultant's optional transaction id instead.
function PaymentRow({ payment, action }: { payment: CommissionPayment; action?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-md text-body-sm">
      <span className="font-medium text-text-primary">{money(payment.amount)}</span>
      <Badge color="secondary">{payment.consultancy_name ?? 'Unknown consultancy'}</Badge>
      <Badge color="primary">{payment.applicant_name ?? 'General'}</Badge>
      {payment.transaction_id && <span className="text-caption text-text-secondary">txn {payment.transaction_id}</span>}
      <span className="text-text-secondary">
        declared {formatDate(payment.recorded_at)}
        {payment.confirmed_at ? ` · confirmed ${formatDate(payment.confirmed_at)}` : ''}
      </span>
      <div className="ml-auto">{action}</div>
    </div>
  )
}

const TABS = ['Overview', 'Payment History'] as const
type Tab = (typeof TABS)[number]

/**
 * All the payment-related things in one place (user, 2026-08-28): the active commission entries
 * (rate-priced at acceptance), the consultancy-declared platform payments awaiting the Confirm
 * action, and the confirmed history. Confirming is the declared → confirmed transition that
 * feeds running totals and the revenue chart. Tabbed (2026-08-28, same decision that split
 * Commission Details): Overview keeps the confirm queue front and center — it stays the primary
 * tab, per "for superadmin old transaction another tab or something" — while the confirmed
 * history moves to its own tab.
 */
export function FinanceDashboardPage() {
  const consultancies = useAdminConsultancies()
  const confirmPayment = useConfirmCommissionPayment()
  const [activeTab, setActiveTab] = useState<Tab>('Overview')
  const [consultancyId, setConsultancyId] = useState('')
  const [country, setCountry] = useState('')
  const [payerMethod, setPayerMethod] = useState<NonNullable<FinanceDashboardFilters['payer_method']> | ''>('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')

  const dashboard = useFinanceDashboard({
    consultancy_id: consultancyId || undefined,
    destination_country: country || undefined,
    payer_method: payerMethod || undefined,
    from: from || undefined,
    to: to || undefined,
  })

  return (
    <AdminShell>
      <div className="flex flex-col gap-lg">
        <div>
          <h1 className="text-h1 text-text-primary">Finance Dashboard</h1>
          <p className="text-body-sm text-text-secondary">
            Every accepted case&rsquo;s commission, what the consultancy has collected so far, and the payments they
            have made to immiNow — declared ones await your confirmation below.
          </p>
        </div>

        <div className="flex gap-xs overflow-x-auto border-b border-border">
          {TABS.map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`shrink-0 border-b-2 px-md py-sm text-body-sm ${
                activeTab === tab ? 'border-primary font-medium text-primary' : 'border-transparent text-text-secondary'
              }`}
            >
              {tab}
            </button>
          ))}
        </div>

        {activeTab === 'Overview' && (
          <>
            <Card className="flex flex-wrap items-end gap-md">
              <SelectField
                label="Consultancy"
                id="filter-consultancy"
                value={consultancyId}
                onChange={(e) => setConsultancyId(e.target.value)}
              >
                <option value="">Any</option>
                {consultancies.data?.items?.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </SelectField>
              <TextField
                label="Destination country"
                value={country}
                onChange={(e) => setCountry(e.target.value)}
                className="max-w-[12rem]"
              />
              <SelectField
                label="Payer method"
                id="filter-payer"
                value={payerMethod}
                onChange={(e) =>
                  setPayerMethod(e.target.value as NonNullable<FinanceDashboardFilters['payer_method']> | '')
                }
              >
                <option value="">Any</option>
                <option value="college">College</option>
                <option value="applicant">Applicant</option>
                <option value="split">Split</option>
              </SelectField>
              <TextField label="From" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
              <TextField label="To" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
            </Card>

            <Card className="w-fit">
              <p className="text-caption text-text-secondary">Due to immiNow (filtered cases)</p>
              <p className="text-h2 text-text-primary">{money(dashboard.data?.running_total)}</p>
            </Card>

            {dashboard.isLoading && <Skeleton className="h-40 rounded-lg" />}

            <div className="flex flex-col gap-sm">
              {dashboard.data?.items.map((entry) => (
                <Card key={entry.id}>
                  <div className="flex items-center gap-md">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-sm">
                        <p className="text-body font-medium text-text-primary">{entry.applicant_name}</p>
                        <Badge color="secondary">{entry.consultancy_name}</Badge>
                        <Badge color="info">{entry.destination_country}</Badge>
                        {entry.case_type === 'pr' ? (
                          <Badge color="primary">PR case</Badge>
                        ) : (
                          <Badge color="primary" className="capitalize">
                            {entry.payer_method}
                          </Badge>
                        )}
                        {entry.rate_source === 'fallback_default' && (
                          // No Commission Rates row existed for this country + payer method at
                          // acceptance — the 10% default applied. Configure the rate.
                          <Badge color="warning">default rate</Badge>
                        )}
                      </div>
                      <p className="text-caption text-text-secondary">
                        {entry.case_type === 'pr'
                          ? 'Contribution recorded'
                          : `Accepted ${formatDate(entry.recognized_at)}`}
                        {entry.college_name ? ` · ${entry.college_name}` : ''} · collected {money(entry.received_total)}{' '}
                        of {money(entry.expected_total)}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-body font-medium text-text-primary">{money(entry.amount)}</p>
                      <p className="text-caption text-text-secondary">{entry.rate_percent}% rate</p>
                    </div>
                  </div>
                </Card>
              ))}
              {dashboard.data?.items.length === 0 && (
                <Card>
                  <p className="text-body text-text-secondary">No cases match these filters.</p>
                </Card>
              )}
            </div>

            <Card className="flex flex-col gap-sm">
              <div>
                <h2 className="text-h3 text-text-primary">Payments Awaiting Confirmation</h2>
                <p className="text-caption text-text-secondary">
                  Declared by consultancies — confirm once the money has actually arrived. Confirmed payments reduce
                  their running total and count into platform revenue.
                </p>
              </div>
              {confirmPayment.isError && <p className="text-body-sm text-error">{confirmPayment.error.message}</p>}
              {(dashboard.data?.declared_payments ?? []).length === 0 && (
                <p className="text-body-sm text-text-secondary">Nothing awaiting confirmation.</p>
              )}
              {dashboard.data?.declared_payments?.map((payment) => (
                <PaymentRow
                  key={payment.id}
                  payment={payment}
                  action={
                    <Button
                      size="sm"
                      onClick={() => confirmPayment.mutate(payment.id)}
                      loading={confirmPayment.isPending && confirmPayment.variables === payment.id}
                    >
                      Confirm Received
                    </Button>
                  }
                />
              ))}
            </Card>
          </>
        )}

        {activeTab === 'Payment History' && (
          <Card className="flex flex-col gap-sm">
            <h2 className="text-h3 text-text-primary">Confirmed Payment History</h2>
            {(dashboard.data?.payment_history ?? []).length === 0 && (
              <p className="text-body-sm text-text-secondary">No confirmed payments yet.</p>
            )}
            {dashboard.data?.payment_history?.map((payment) => (
              <PaymentRow key={payment.id} payment={payment} action={<Badge color="success">confirmed</Badge>} />
            ))}
          </Card>
        )}
      </div>
    </AdminShell>
  )
}
