import { useMemo, useState, type FormEvent } from 'react'
import { SelectField } from '@/components/SelectField'
import { Button } from '@/components/Button'
import { Badge } from '@/components/Badge'
import { TextField } from '@/components/TextField'
import { Table, type TableColumn } from '@/components/Table'
import { Modal } from '@/components/Modal'
import {
  useFreelancers,
  useFreelancerRates,
  useCreateFreelancerRate,
  useUpdateFreelancerRate,
} from '@/queries/freelancerRates'
import { useCommissionRates } from '@/queries/commissionRates'
import type { components } from '@/api/schema'

type FreelancerRate = components['schemas']['FreelancerRate']

// User-requested (2026-08-15) — "wherever there is add button, use popup, instead of inline
// form." Was an inline Card that expanded below the page header; now a Modal, same fields.
function AddRateForm({ onClose }: { onClose: () => void }) {
  const freelancers = useFreelancers()
  const rates = useFreelancerRates()
  const createRate = useCreateFreelancerRate()
  const [freelancerId, setFreelancerId] = useState('')
  const [rate, setRate] = useState(8)

  const availableFreelancers = freelancers.data?.filter((f) => !rates.data?.some((r) => r.freelancer_id === f.id))

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!freelancerId) return
    createRate.mutate({ freelancer_id: freelancerId, rate }, { onSuccess: () => onClose() })
  }

  return (
    <Modal
      onClose={onClose}
      title="Set Rate"
      widthRem={26}
      footer={
        <>
          {createRate.isError && (
            <p className="mr-auto self-center text-body-sm text-error">{createRate.error.message}</p>
          )}
          <Button type="submit" form="set-rate-form" loading={createRate.isPending} disabled={!freelancerId}>
            Set Rate
          </Button>
        </>
      }
    >
      <form id="set-rate-form" onSubmit={handleSubmit} className="flex flex-col gap-md">
        <SelectField
          label="Freelancer"
          id="rate-freelancer"
          value={freelancerId}
          onChange={(e) => setFreelancerId(e.target.value)}
        >
          <option value="">Select…</option>
          {availableFreelancers?.map((f) => (
            <option key={f.id} value={f.id}>
              {f.name}
            </option>
          ))}
        </SelectField>
        <TextField
          label="Rate %"
          type="number"
          min={0}
          max={100}
          value={rate}
          onChange={(e) => setRate(Number(e.target.value))}
        />
      </form>
    </Modal>
  )
}

// Row-level component so useUpdateFreelancerRate(rate.id) can be called at its own render top
// level — Table's `render: (row) => ...` runs as a callback, not a component body.
function RateEditor({ rate }: { rate: FreelancerRate }) {
  const updateRate = useUpdateFreelancerRate(rate.id!)
  const [value, setValue] = useState(rate.rate ?? 0)

  return (
    <div className="flex items-center justify-end gap-sm">
      <TextField
        label="Rate %"
        type="number"
        min={0}
        max={100}
        value={value}
        onChange={(e) => setValue(Number(e.target.value))}
        className="max-w-[7rem]"
      />
      <Button
        variant="secondary"
        loading={updateRate.isPending}
        disabled={value === rate.rate}
        onClick={() => updateRate.mutate(value)}
      >
        Save
      </Button>
    </div>
  )
}

/**
 * The Freelancer Commission Table, as a PANEL rather than a page (user-requested, 2026-08-27:
 * "can we put Freelancer Rates inside Freelancer page itself?").
 *
 * It reads as a second view of one subject rather than a second subject: the rows are the same
 * people, and a rate is meaningless without the freelancer it belongs to. Keeping its own header
 * and AdminShell here would nest a page inside a page, so both live on the parent now.
 */
export function FreelancerRatesPanel() {
  const rates = useFreelancerRates()
  const commissionRates = useCommissionRates()
  const [showAdd, setShowAdd] = useState(false)
  const [sort, setSort] = useState<{ field: string; direction: 'asc' | 'desc' } | null>(null)
  const [search, setSearch] = useState('')

  const rows = useMemo(() => {
    let items = rates.data ?? []
    if (search) {
      const q = search.toLowerCase()
      items = items.filter((r) => r.freelancer_name?.toLowerCase().includes(q))
    }
    if (sort) {
      const dir = sort.direction === 'desc' ? -1 : 1
      items = [...items].sort((a, b) => {
        const av = sort.field === 'rate' ? (a.rate ?? 0) : (a.freelancer_name ?? '').toLowerCase()
        const bv = sort.field === 'rate' ? (b.rate ?? 0) : (b.freelancer_name ?? '').toLowerCase()
        return av < bv ? -1 * dir : av > bv ? 1 * dir : 0
      })
    }
    return items
  }, [rates.data, search, sort])

  // The page states "immiNow spread = consultancy rate − this rate", so a freelancer rate above the
  // consultancy rate means immiNow pays out more than it earns. The freelancer rate is flat while
  // commission rates are per consultancy+country, so the honest comparison is against the LOWEST
  // freelancer-sourced rate on the board: above that, at least one arrangement is loss-making.
  //
  // Allowed rather than blocked (user decision, 2026-08-27) — a deliberate loss-leader is a real
  // commercial choice — but never silent.
  const lowestConsultancyRate = useMemo(() => {
    const values = (commissionRates.data ?? [])
      .map((r) => r.freelancer_sourced_rate)
      .filter((v): v is number => typeof v === 'number')
    return values.length > 0 ? Math.min(...values) : null
  }, [commissionRates.data])

  const columns: TableColumn<FreelancerRate>[] = [
    {
      key: 'freelancer_name',
      header: 'Freelancer',
      sortable: true,
      render: (r) => <span className="font-medium text-text-primary">{r.freelancer_name}</span>,
    },
    {
      key: 'spread',
      header: '',
      render: (r) => {
        const negative =
          lowestConsultancyRate != null && typeof r.rate === 'number' && r.rate > lowestConsultancyRate
        return negative ? (
          <Badge color="warning">
            Above the lowest consultancy rate ({lowestConsultancyRate}%) — immiNow pays out more than it earns
          </Badge>
        ) : (
          <Badge color="info">immiNow spread = consultancy rate − this rate</Badge>
        )
      },
    },
    { key: 'rate', header: 'Rate', sortable: true, align: 'right', render: (r) => <RateEditor rate={r} /> },
  ]

  return (
    <div className="flex flex-col gap-lg">
      <div className="flex items-start justify-between gap-md">
        <p className="text-body-sm text-text-secondary">
          The flat percentage each freelancer personally earns. immiNow keeps the spread between this and the
          consultancy&rsquo;s own commission rate.
        </p>
        <Button onClick={() => setShowAdd(true)}>Set Rate</Button>
      </div>

      {showAdd && <AddRateForm onClose={() => setShowAdd(false)} />}

      <Table
        columns={columns}
        rows={rows}
        rowKey={(r) => r.id!}
        loading={rates.isLoading}
        error={rates.isError ? 'Could not load freelancer rates.' : undefined}
        emptyMessage="No freelancer rates set yet."
        sort={sort}
        onSortChange={(field, direction) => setSort({ field, direction })}
        search={{ value: search, onChange: setSearch, placeholder: 'Search freelancer…' }}
      />
    </div>
  )
}
