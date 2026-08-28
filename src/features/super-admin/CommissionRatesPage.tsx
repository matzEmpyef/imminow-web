import { useEffect, useMemo, useState, type FormEvent } from 'react'
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
import { useCommissionRates, useUpdateCommissionRate, useBulkSetCommissionRates } from '@/queries/commissionRates'
import type { components } from '@/api/schema'

type CommissionRate = components['schemas']['CommissionRate']
type PayerMethod = NonNullable<CommissionRate['payer_method']>

const PAYER_METHOD_LABELS: Record<PayerMethod, string> = {
  college: 'College',
  applicant: 'Applicant',
  split: 'Split',
  // Rates-config-only dimension (2026-08-28): prices PR cases for the country. Journeys never
  // carry `pr` as a payer — a PR entry's payer is always the applicant.
  pr: 'PR case',
}

const RATE_GROUPS: { key: PayerMethod; label: string }[] = [
  { key: 'applicant', label: 'Applicant' },
  { key: 'college', label: 'College' },
  { key: 'split', label: 'Split' },
  { key: 'pr', label: 'PR case' },
]

interface MatrixRow {
  direct: string
  freelancer: string
}
type MatrixState = Record<PayerMethod, MatrixRow>

function blankMatrix(): MatrixState {
  return {
    applicant: { direct: '', freelancer: '' },
    college: { direct: '', freelancer: '' },
    split: { direct: '', freelancer: '' },
    pr: { direct: '', freelancer: '' },
  }
}

// Builds the matrix's starting values from whatever rows already exist for this
// (consultancy, country) — one payer group may be set and the other three blank, which is
// exactly the case this modal exists to make easy to finish.
function matrixFromExistingRates(rates: CommissionRate[], consultancyId: string, country: string): MatrixState {
  const matrix = blankMatrix()
  for (const rate of rates) {
    if (rate.consultancy_id !== consultancyId || rate.destination_country !== country) continue
    const method = rate.payer_method as PayerMethod
    if (!matrix[method]) continue
    matrix[method] = {
      direct: String(rate.direct_rate ?? ''),
      freelancer: String(rate.freelancer_sourced_rate ?? ''),
    }
  }
  return matrix
}

// Replaces the old per-payer-method "+ Add Rate" flow (user decision, 2026-08-28 — "the super
// admin should be able to add these 8 rates manually, should not have to click add for each
// type... no need of add rows"). One popup, one Save, all four payer rows for a
// (consultancy, destination_country) pair — whether that pair has no rates yet, some, or all
// four already (in which case this is simply the edit form, prefilled). Calls
// `PUT /commission-rates/bulk`, which upserts atomically.
function RateMatrixModal({
  onClose,
  allRates,
  defaultConsultancyId,
  defaultCountry,
  lockConsultancy,
  lockCountry,
}: {
  onClose: () => void
  allRates: CommissionRate[]
  defaultConsultancyId?: string
  defaultCountry?: string
  lockConsultancy?: boolean
  lockCountry?: boolean
}) {
  const consultancies = useAdminConsultancies({ limit: 100 })
  const bulkSet = useBulkSetCommissionRates()
  const [consultancyId, setConsultancyId] = useState(defaultConsultancyId ?? '')
  const [country, setCountry] = useState(defaultCountry ?? '')
  const [matrix, setMatrix] = useState<MatrixState>(() =>
    defaultConsultancyId && defaultCountry
      ? matrixFromExistingRates(allRates, defaultConsultancyId, defaultCountry)
      : blankMatrix(),
  )
  const [touched, setTouched] = useState(false)
  // Validation is checked ON SAVE, not while typing (user, 2026-08-28: "do not have display
  // 'Direct % must be between 0 and 100' ... just make sure when saving") — errors render only
  // after a save attempt, and clear per row as the values are fixed.
  const [attempted, setAttempted] = useState(false)

  // Re-seeds the matrix from whatever's already saved whenever the (consultancy, country) pair
  // resolves to a new one — covers the unlocked top-level flow, where picking a consultancy and
  // country that already has rates should show the edit form, not a blank one.
  useEffect(() => {
    if (touched) return
    if (consultancyId && country) {
      setMatrix(matrixFromExistingRates(allRates, consultancyId, country))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [consultancyId, country])

  const selectedConsultancy = consultancies.data?.items?.find((c) => c.id === consultancyId)
  // Hidden rather than shown-disabled (user-requested, 2026-08-27) whenever the chosen
  // consultancy's freelancer channel is off — the server auto-fills this column equal to
  // direct_rate in that case, so showing an input for it would invite a value that's never used.
  const freelancerDisabled = Boolean(consultancyId) && !selectedConsultancy?.freelancer_enabled

  function setCell(method: PayerMethod, field: 'direct' | 'freelancer', value: string) {
    setTouched(true)
    setMatrix((prev) => ({ ...prev, [method]: { ...prev[method], [field]: value } }))
  }

  // Mirrors the server's own rule (mock-server/server.js resolveAndValidateFreelancerRate) so a
  // bad value never round-trips to the server just to be told no.
  const errors = useMemo(() => {
    const rowErrors: Partial<Record<PayerMethod, string>> = {}
    for (const { key } of RATE_GROUPS) {
      const direct = Number(matrix[key].direct)
      const freelancer = Number(matrix[key].freelancer)
      if (matrix[key].direct === '' || Number.isNaN(direct) || direct < 0 || direct > 100) {
        rowErrors[key] = 'Direct % must be between 0 and 100.'
        continue
      }
      if (freelancerDisabled) continue
      if (matrix[key].freelancer === '' || Number.isNaN(freelancer) || freelancer < 0 || freelancer > 100) {
        rowErrors[key] = 'Freelancer-sourced % must be between 0 and 100.'
        continue
      }
      if (freelancer <= direct) {
        rowErrors[key] = 'Freelancer-sourced % must be greater than the direct %.'
      }
    }
    return rowErrors
  }, [matrix, freelancerDisabled])

  const canSubmit = Boolean(consultancyId) && Boolean(country)

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!canSubmit) return
    if (Object.keys(errors).length > 0) {
      setAttempted(true)
      return
    }
    const rates = Object.fromEntries(
      RATE_GROUPS.map(({ key }) => {
        const direct = Number(matrix[key].direct)
        // Still sent even when hidden: freelancer_sourced_rate is required by the contract, and
        // the server auto-fills it equal to direct_rate for a channel-disabled consultancy
        // regardless of what's sent — hiding the input is a display decision, not a data one.
        const freelancer = freelancerDisabled ? direct : Number(matrix[key].freelancer)
        return [key, { direct_rate: direct, freelancer_sourced_rate: freelancer }]
      }),
    ) as {
      applicant: components['schemas']['CommissionRateBulkGroup']
      college: components['schemas']['CommissionRateBulkGroup']
      split: components['schemas']['CommissionRateBulkGroup']
      pr: components['schemas']['CommissionRateBulkGroup']
    }
    bulkSet.mutate(
      { consultancy_id: consultancyId, destination_country: country, rates },
      { onSuccess: () => onClose() },
    )
  }

  return (
    <Modal
      onClose={onClose}
      title={country ? `Rates — ${country}` : 'Set Rates'}
      widthRem={38}
      footer={
        <>
          {bulkSet.isError && <p className="mr-auto self-center text-body-sm text-error">{bulkSet.error.message}</p>}
          <Button type="submit" form="rate-matrix-form" loading={bulkSet.isPending} disabled={!canSubmit}>
            Save
          </Button>
        </>
      }
    >
      <form id="rate-matrix-form" onSubmit={handleSubmit} className="flex flex-col gap-md">
        <SelectField
          label="Consultancy"
          id="matrix-consultancy"
          value={consultancyId}
          onChange={(e) => setConsultancyId(e.target.value)}
          disabled={lockConsultancy}
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
          disabled={lockCountry}
        />

        <div className="flex flex-col gap-md rounded-md bg-background p-md">
          {RATE_GROUPS.map(({ key, label }) => (
            <div key={key} className="flex flex-col gap-xs border-b border-border pb-md last:border-0 last:pb-0">
              <div className="flex items-center gap-sm">
                {/* PR rows get their own tint so student pricing and PR pricing read apart at a
                    glance — same convention ConsultancyRatesModal uses for the read-only view. */}
                <Badge color={key === 'pr' ? 'primary' : 'info'} className="w-24 shrink-0 justify-center">
                  {label}
                </Badge>
                {/* flex-1, not a max-w bracket class — arbitrary bracket values generate zero
                    CSS in this project's Tailwind setup (see Modal.tsx), so the old cap never
                    applied and the row's flex squeezed these narrow. */}
                <TextField
                  label="Direct %"
                  type="number"
                  min={0}
                  max={100}
                  value={matrix[key].direct}
                  onChange={(e) => setCell(key, 'direct', e.target.value)}
                  className="flex-1"
                />
                {!freelancerDisabled && (
                  <TextField
                    label="Freelancer %"
                    type="number"
                    min={0}
                    max={100}
                    value={matrix[key].freelancer}
                    onChange={(e) => setCell(key, 'freelancer', e.target.value)}
                    className="flex-1"
                  />
                )}
              </div>
              {attempted && errors[key] && <p className="text-caption text-error">{errors[key]}</p>}
            </div>
          ))}
          {freelancerDisabled && (
            <p className="text-caption text-text-secondary">
              Freelancer channel is off for this consultancy — every freelancer-sourced % is auto-set equal to its
              direct %.
            </p>
          )}
        </div>
      </form>
    </Modal>
  )
}

// Row-level component so useUpdateCommissionRate(rate.id) can be called at its own render top
// level — Table's `render: (row) => ...` runs as a callback, not a component body.
// freelancerDisabled (2026-08-19) — "if enabled on freelancer rates applicable". The Freelancer
// field is HIDDEN whenever the consultancy's own freelancer channel is off (user-requested,
// 2026-08-27: "hide the field in the popup instead of showing channel disabled"). It was previously
// rendered disabled with a "Channel disabled" caption, which reads as an input the admin still
// ought to deal with. The stored rate is untouched — turning the channel back on brings the field,
// and its existing value, straight back.
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
        min={0}
        max={100}
        value={directRate}
        onChange={(e) => setDirectRate(Number(e.target.value))}
        className="max-w-[7rem]"
      />
      {!freelancerDisabled && (
        <TextField
          label="Freelancer %"
          type="number"
          min={0}
          max={100}
          value={freelancerRate}
          onChange={(e) => setFreelancerRate(Number(e.target.value))}
          className="max-w-[7rem]"
        />
      )}
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
function ConsultancyRatesModal({
  summary,
  allRates,
  onClose,
}: {
  summary: ConsultancySummary
  allRates: CommissionRate[]
  onClose: () => void
}) {
  const updateEntitlements = useUpdateEntitlements(summary.consultancyId)
  const [countrySearch, setCountrySearch] = useState('')
  const [editingCountry, setEditingCountry] = useState<string | null>(null)

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
                  <Button variant="secondary" onClick={() => setEditingCountry(country)}>
                    {rates.length === 0 ? 'Set rates' : 'Edit rates'}
                  </Button>
                </div>
                {rates.length === 0 ? (
                  <p className="text-caption text-text-secondary">No rate configured for this country yet.</p>
                ) : (
                  <div className="flex flex-col gap-sm">
                    {rates.map((rate) => (
                      <div key={rate.id} className="flex items-center justify-between gap-md">
                        {/* PR rows get their own tint so student pricing and PR pricing read
                            apart at a glance. */}
                        <Badge color={rate.payer_method === 'pr' ? 'primary' : 'info'} className="capitalize">
                          {PAYER_METHOD_LABELS[rate.payer_method as PayerMethod] ?? rate.payer_method}
                        </Badge>
                        {/* Quick single-value tweak, kept alongside the matrix popup (which
                            handles all four rows at once) rather than removed — the fastest path
                            to nudging one already-configured percentage without reopening a full
                            matrix over three rows nobody's touching. */}
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
      {editingCountry && (
        <RateMatrixModal
          allRates={allRates}
          defaultConsultancyId={summary.consultancyId}
          defaultCountry={editingCountry}
          lockConsultancy
          lockCountry
          onClose={() => setEditingCountry(null)}
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
  const [showMatrix, setShowMatrix] = useState(false)
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
          <Button onClick={() => setShowMatrix(true)}>Set Rates</Button>
        </div>

        {showMatrix && <RateMatrixModal allRates={rates.data ?? []} onClose={() => setShowMatrix(false)} />}
        {viewingSummary && (
          <ConsultancyRatesModal
            summary={viewingSummary}
            allRates={rates.data ?? []}
            onClose={() => setViewingConsultancyId(null)}
          />
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
