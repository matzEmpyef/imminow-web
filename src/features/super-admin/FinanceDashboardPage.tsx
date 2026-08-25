import { useState } from 'react'
import { AdminShell } from '@/features/auth/AdminShell'
import { SelectField } from '@/components/SelectField'
import { Card } from '@/components/Card'
import { Badge } from '@/components/Badge'
import { TextField } from '@/components/TextField'
import { useAdminConsultancies } from '@/queries/adminConsultancies'
import { useFinanceDashboard, type FinanceDashboardFilters } from '@/queries/financeDashboard'
import { formatDate } from '@/lib/time'
import { Skeleton } from '@/components/QueryState'

export function FinanceDashboardPage() {
  const consultancies = useAdminConsultancies()
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
            Completed cases with recognized commission only — filterable, with a running total.
          </p>
        </div>

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
          <p className="text-caption text-text-secondary">Running total</p>
          <p className="text-h2 text-text-primary">
            {dashboard.data?.running_total.currency} {dashboard.data?.running_total.amount?.toLocaleString()}
          </p>
        </Card>

        {dashboard.isLoading && <Skeleton className="h-40 rounded-lg" />}

        <div className="flex flex-col gap-sm">
          {dashboard.data?.items.map((entry) => (
            <Card key={entry.id}>
              <div className="flex items-center gap-md">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-sm">
                    <p className="text-body font-medium text-text-primary">{entry.applicant_name}</p>
                    <Badge color="secondary">{entry.consultancy_name}</Badge>
                    <Badge color="info">{entry.destination_country}</Badge>
                    <Badge color="primary" className="capitalize">
                      {entry.payer_method}
                    </Badge>
                    {entry.reopened_flag && <Badge color="warning">Reopened after recognition</Badge>}
                  </div>
                  <p className="text-caption text-text-secondary">Recognized {formatDate(entry.recognized_at)}</p>
                </div>
                <p className="text-body font-medium text-text-primary">
                  {entry.amount.currency} {entry.amount.amount?.toLocaleString()}
                </p>
              </div>
            </Card>
          ))}
          {dashboard.data?.items.length === 0 && (
            <Card>
              <p className="text-body text-text-secondary">No completed cases match these filters.</p>
            </Card>
          )}
        </div>
      </div>
    </AdminShell>
  )
}
