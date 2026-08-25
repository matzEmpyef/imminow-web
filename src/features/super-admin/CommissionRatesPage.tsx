import { useMemo, useState, type FormEvent } from 'react'
import { AdminShell } from '@/features/auth/AdminShell'
import { SelectField } from '@/components/SelectField'
import { Button } from '@/components/Button'
import { Badge } from '@/components/Badge'
import { TextField } from '@/components/TextField'
import { CountrySelect } from '@/components/CountrySelect'
import { Toggle } from '@/components/Toggle'
import { Table, type TableColumn } from '@/components/Table'
import { StopPropagation } from '@/components/StopPropagation'
import { Modal } from '@/components/Modal'
import { useAdminConsultancies, useUpdateEntitlements } from '@/queries/adminConsultancies'
import { useCommissionRates, useCreateCommissionRate, useUpdateCommissionRate } from '@/queries/commissionRates'
import type { components } from '@/api/schema'

type CommissionRate = components['schemas']['CommissionRate']
type PayerMethod = NonNullable<CommissionRate['payer_method']>

const PAYER_METHOD_LABELS: Record<PayerMethod, string> = {
  college: 'College',
  applicant: 'Applicant',
  split: 'Split',
}

// User-requested (2026-08-15) — "wherever there is add button, use popup, instead of inline
// form." Was an inline Card that expanded below the page header; now a Modal, same fields.
function AddRateForm({
  onClose,
  defaultConsultancyId,
  defaultCountry,
}: {
  onClose: () => void
  defaultConsultancyId?: string
  defaultCountry?: string
}) {
  const consultancies = useAdminConsultancies()
  const createRate = useCreateCommissionRate()
  const [consultancyId, setConsultancyId] = useState(defaultConsultancyId ?? '')
  const [country, setCountry] = useState(defaultCountry ?? '')
  const [payerMethod, setPayerMethod] = useState<PayerMethod>('applicant')
  const [directRate, setDirectRate] = useState(10)
  const [freelancerRate, setFreelancerRate] = useState(13)

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!consultancyId || !country) return
    createRate.mutate(
      {
        consultancy_id: consultancyId,
        destination_country: country,
        payer_method: payerMethod,
        direct_rate: directRate,
        freelancer_sourced_rate: freelancerRate,
      },
      { onSuccess: () => onClose() },
    )
  }

  return (
    <Modal
      onClose={onClose}
      title="Add Rate"
      widthRem={28}
      footer={
        <>
          {createRate.isError && (
            <p className="mr-auto self-center text-body-sm text-error">{createRate.error.message}</p>
          )}
          <Button
            type="submit"
            form="add-rate-form"
            loading={createRate.isPending}
            disabled={!consultancyId || !country}
          >
            Create Rate
          </Button>
        </>
      }
    >
      <form id="add-rate-form" onSubmit={handleSubmit} className="flex flex-col gap-md">
        <SelectField
          label="Consultancy"
          id="rate-consultancy"
          value={consultancyId}
          onChange={(e) => setConsultancyId(e.target.value)}
          disabled={Boolean(defaultConsultancyId)}
        >
          <option value="">Select…</option>
          {consultancies.data?.items?.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </SelectField>
        <CountrySelect
          label="Destination country"
          value={country}
          onChange={setCountry}
          size="compact"
          disabled={Boolean(defaultCountry)}
        />
        <SelectField
          label="Payer method"
          id="rate-payer"
          value={payerMethod}
          onChange={(e) => setPayerMethod(e.target.value as PayerMethod)}
        >
          <option value="college">College</option>
          <option value="applicant">Applicant</option>
          <option value="split">Split</option>
        </SelectField>
        <TextField
          label="Direct rate %"
          type="number"
          value={directRate}
          onChange={(e) => setDirectRate(Number(e.target.value))}
        />
        <TextField
          label="Freelancer-sourced rate %"
          type="number"
          value={freelancerRate}
          onChange={(e) => setFreelancerRate(Number(e.target.value))}
        />
      </form>
    </Modal>
  )
}

// Row-level component so useUpdateCommissionRate(rate.id) can be called at its own render top
// level — Table's `render: (row) => ...` runs as a callback, not a component body.
// freelancerDisabled (2026-08-19) — "if enabled on freelancer rates applicable" — the Freelancer
// field stays visible (the rate itself isn't deleted, just not currently applicable) but disabled,
// with a caption explaining why, whenever the consultancy's own freelancer channel is off.
function RateEditor({ rate, freelancerDisabled }: { rate: CommissionRate; freelancerDisabled: boolean }) {
  const updateRate = useUpdateCommissionRate(rate.id!)
  const [directRate, setDirectRate] = useState(rate.direct_rate ?? 0)
  const [freelancerRate, setFreelancerRate] = useState(rate.freelancer_sourced_rate ?? 0)
  const dirty = directRate !== rate.direct_rate || freelancerRate !== rate.freelancer_sourced_rate

  return (
    <StopPropagation className="flex items-center gap-sm">
      <TextField
        label="Direct %"
        type="number"
        value={directRate}
        onChange={(e) => setDirectRate(Number(e.target.value))}
        className="max-w-[7rem]"
      />
      <div className="flex flex-col">
        <TextField
          label="Freelancer %"
          type="number"
          value={freelancerRate}
          onChange={(e) => setFreelancerRate(Number(e.target.value))}
          disabled={freelancerDisabled}
          className="max-w-[7rem]"
        />
        {freelancerDisabled && <p className="text-caption text-text-secondary">Channel disabled</p>}
      </div>
      <Button
        variant="secondary"
        loading={updateRate.isPending}
        disabled={!dirty}
        onClick={() => updateRate.mutate({ direct_rate: directRate, freelancer_sourced_rate: freelancerRate })}
      >
        Save
      </Button>
    </StopPropagation>
  )
}

interface ConsultancySummary {
  consultancyId: string
  consultancyName: string
  tier?: string
  city?: string
  freelancerEnabled: boolean
  countriesServed: string[]
  countries: string[]
  rates: CommissionRate[]
}

// Only the countries this consultancy actually serves (user-requested, 2026-08-19 — "show only
// served countries, not entire list" — supersedes the original "all countries must be listed"
// call from earlier the same day), not every country the platform recognizes — each served
// country shows its configured payer-method rows inline, or a prompt to add one. Opened by
// clicking a consultancy's row on the summary list below.
function ConsultancyRatesModal({ summary, onClose }: { summary: ConsultancySummary; onClose: () => void }) {
  const updateEntitlements = useUpdateEntitlements(summary.consultancyId)
  const [countrySearch, setCountrySearch] = useState('')
  const [addingCountry, setAddingCountry] = useState<string | null>(null)

  const ratesByCountry = useMemo(() => {
    const map = new Map<string, CommissionRate[]>()
    for (const rate of summary.rates) {
      if (!rate.destination_country) continue
      const list = map.get(rate.destination_country) ?? []
      list.push(rate)
      map.set(rate.destination_country, list)
    }
    return map
  }, [summary.rates])

  // User-requested (2026-08-19) — "show countries which consultancy selected under Countries
  // served," then further narrowed the same day to "show only served countries, not entire
  // list" — restricted to `countriesServed` rather than the full platform `countries` catalog.
  const visibleCountries = useMemo(() => {
    const served = summary.countriesServed
    const filtered = countrySearch
      ? served.filter((c) => c.toLowerCase().includes(countrySearch.toLowerCase()))
      : served
    return [...filtered].sort((a, b) => a.localeCompare(b))
  }, [countrySearch, summary.countriesServed])

  return (
    <Modal onClose={onClose} title={summary.consultancyName} widthRem={44}>
      <div className="flex flex-col gap-lg">
        <div className="flex items-center justify-between rounded-md bg-background px-md py-sm">
          <div>
            <p className="text-body-sm font-medium text-text-primary">Freelancer channel</p>
            <p className="text-caption text-text-secondary">
              When off, every Freelancer % rate below is not applicable and Applicant Allocation won't offer this
              consultancy for freelancer-sourced aspirants.
            </p>
          </div>
          <Toggle
            checked={summary.freelancerEnabled}
            onChange={(checked) => updateEntitlements.mutate({ freelancer_enabled: checked })}
            label="Freelancer channel"
          />
        </div>

        <TextField
          label="Search countries"
          value={countrySearch}
          onChange={(e) => setCountrySearch(e.target.value)}
          placeholder="Search…"
        />

        <div className="flex max-h-[26rem] flex-col gap-md overflow-y-auto">
          {visibleCountries.length === 0 && (
            <p className="text-body-sm text-text-secondary">
              {summary.countriesServed.length === 0
                ? 'This consultancy has not selected any served countries yet.'
                : `No served countries match "${countrySearch}".`}
            </p>
          )}
          {visibleCountries.map((country) => {
            const rates = ratesByCountry.get(country) ?? []
            return (
              <div key={country} className="flex flex-col gap-sm border-b border-border pb-md last:border-0">
                <div className="flex items-center justify-between">
                  <Badge color="secondary">{country}</Badge>
                  <Button variant="secondary" onClick={() => setAddingCountry(country)}>
                    + Add Rate
                  </Button>
                </div>
                {rates.length === 0 ? (
                  <p className="text-caption text-text-secondary">No rate configured for this country yet.</p>
                ) : (
                  <div className="flex flex-col gap-sm">
                    {rates.map((rate) => (
                      <div key={rate.id} className="flex items-center justify-between gap-md">
                        <Badge color="info" className="capitalize">
                          {PAYER_METHOD_LABELS[rate.payer_method as PayerMethod] ?? rate.payer_method}
                        </Badge>
                        <RateEditor rate={rate} freelancerDisabled={!summary.freelancerEnabled} />
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>
      {addingCountry && (
        <AddRateForm
          defaultConsultancyId={summary.consultancyId}
          defaultCountry={addingCountry}
          onClose={() => setAddingCountry(null)}
        />
      )}
    </Modal>
  )
}

// Restructured from a flat per-(consultancy, country, payer method) row list into a per-
// consultancy summary list (user-requested, 2026-08-19 — "I want list of all consultancies...
// any other details. on click i see list of all countries they handle (all countries must be
// listed)") — clicking a consultancy opens the country-level drill-down (`ConsultancyRatesModal`
// above), same summary-row → drill-down-popup shape as Manage Consultancies/College Detail
// elsewhere. Built from every consultancy (not just ones with a rate already configured, per the
// "all countries must be listed" correction to how this page first shipped), joined against the
// flat `CommissionRate` list for tier/city/rate counts.
export function CommissionRatesPage() {
  const rates = useCommissionRates()
  const consultancies = useAdminConsultancies({ limit: 100 })
  const [showAdd, setShowAdd] = useState(false)
  const [viewingConsultancyId, setViewingConsultancyId] = useState<string | null>(null)
  const [sort, setSort] = useState<{ field: string; direction: 'asc' | 'desc' } | null>(null)
  const [search, setSearch] = useState('')

  const summaries = useMemo(() => {
    return (consultancies.data?.items ?? []).map((c): ConsultancySummary => {
      const ownRates = (rates.data ?? []).filter((r) => r.consultancy_id === c.id)
      const countries = [...new Set(ownRates.map((r) => r.destination_country).filter((c): c is string => Boolean(c)))]
      return {
        consultancyId: c.id!,
        consultancyName: c.name ?? '',
        tier: c.tier,
        city: c.city,
        freelancerEnabled: Boolean(c.freelancer_enabled),
        countriesServed: c.countries_served ?? [],
        countries,
        rates: ownRates,
      }
    })
  }, [rates.data, consultancies.data])

  const rows = useMemo(() => {
    let items = summaries
    if (search) {
      const q = search.toLowerCase()
      items = items.filter((s) => s.consultancyName.toLowerCase().includes(q) || s.city?.toLowerCase().includes(q))
    }
    if (sort) {
      const dir = sort.direction === 'desc' ? -1 : 1
      items = [...items].sort((a, b) => {
        const av =
          sort.field === 'countries'
            ? a.countries.length
            : sort.field === 'city'
              ? (a.city ?? '')
              : a.consultancyName.toLowerCase()
        const bv =
          sort.field === 'countries'
            ? b.countries.length
            : sort.field === 'city'
              ? (b.city ?? '')
              : b.consultancyName.toLowerCase()
        return av < bv ? -1 * dir : av > bv ? 1 * dir : 0
      })
    }
    return items
  }, [summaries, search, sort])

  const viewingSummary = viewingConsultancyId
    ? summaries.find((s) => s.consultancyId === viewingConsultancyId)
    : undefined

  const columns: TableColumn<ConsultancySummary>[] = [
    {
      key: 'consultancy_name',
      header: 'Consultancy',
      sortable: true,
      render: (s) => <span className="font-medium text-text-primary">{s.consultancyName}</span>,
    },
    {
      key: 'tier',
      header: 'Plan',
      render: (s) =>
        s.tier ? (
          <Badge color="primary" className="capitalize">
            {s.tier}
          </Badge>
        ) : (
          '—'
        ),
    },
    { key: 'city', header: 'City', sortable: true, render: (s) => s.city ?? '—' },
    { key: 'countries', header: 'Rates Configured', sortable: true, align: 'right', render: (s) => s.countries.length },
    { key: 'rates', header: 'Rate Rules', align: 'right', render: (s) => s.rates.length },
    {
      key: 'freelancer',
      header: 'Freelancer',
      render: (s) => (
        <Badge color={s.freelancerEnabled ? 'success' : 'secondary'}>
          {s.freelancerEnabled ? 'Enabled' : 'Disabled'}
        </Badge>
      ),
    },
  ]

  return (
    <AdminShell>
      <div className="flex flex-col gap-lg">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-h1 text-text-primary">Commission Rates</h1>
            <p className="text-body-sm text-text-secondary">
              Every consultancy on the platform — click one to see every country and its rates.
            </p>
          </div>
          <Button onClick={() => setShowAdd(true)}>Add Rate</Button>
        </div>

        {showAdd && <AddRateForm onClose={() => setShowAdd(false)} />}
        {viewingSummary && (
          <ConsultancyRatesModal summary={viewingSummary} onClose={() => setViewingConsultancyId(null)} />
        )}

        <Table
          columns={columns}
          rows={rows}
          rowKey={(s) => s.consultancyId}
          loading={rates.isLoading || consultancies.isLoading}
          emptyMessage="No consultancies yet."
          sort={sort}
          onSortChange={(field, direction) => setSort({ field, direction })}
          search={{ value: search, onChange: setSearch, placeholder: 'Search consultancy or city…' }}
          onRowClick={(s) => setViewingConsultancyId(s.consultancyId)}
        />
      </div>
    </AdminShell>
  )
}
