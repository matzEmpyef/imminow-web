import { useState, type FormEvent } from 'react'
import { Pencil } from 'lucide-react'
import { Badge } from '@/components/Badge'
import { Button } from '@/components/Button'
import { Card } from '@/components/Card'
import { Modal } from '@/components/Modal'
import { Table, type TableColumn } from '@/components/Table'
import { TextField } from '@/components/TextField'
import { useExchangeRates, useMissingExchangeRates, useUpsertExchangeRate } from '@/queries/catalogSettings'
import { daysSince, formatDate } from '@/lib/time'
import { showToast } from '@/lib/toast'
import type { components } from '@/api/schema'
import { SettingsUsedIn } from './SettingsUsedIn'

type ExchangeRate = components['schemas']['ExchangeRate']

/**
 * How old a hand-set exchange rate may get before this tab asks someone to look at it.
 *
 * Rates are set by hand with no feed, so an old one quietly skews every "≈" amount and every
 * cross-currency fee filter. THIRTY DAYS is the decision, kept (assumptions audit M36 — product
 * owner, 2026-09-19: "keep the 30-day stale threshold but name it once as a constant with
 * owner+date, no settings UI"). One constant, read by the column, the badge and the summary
 * line, so the number on screen and the number in the test are the same number.
 */
const STALE_RATE_DAYS = 30

/** Same floored elapsed-days rule as everywhere else (M38) — null when there is no date at all. */
function rateAgeDays(iso: string | null | undefined) {
  if (!iso) return null
  return daysSince(iso)
}

function agoLabel(days: number) {
  return days === 0 ? 'today' : days === 1 ? '1 day ago' : `${days} days ago`
}

type MissingRate = components['schemas']['MissingExchangeRate']

// The rupee is what every rate is measured in, so it has no rate of its own to set: one rupee is
// one rupee (owner decision 11). The server refuses a write to it; here it is shown as a fixed row
// with no edit control, whether or not the server's table happens to hold a row for it.
const BASE_CURRENCY = 'INR'

// A saved rate that moves by more than this, either way, has to be confirmed (owner decision 11,
// review W2-C05): the only check used to be "greater than zero", so 6.2 typed for 62 was accepted
// and frozen onto every payment declared until someone noticed.
const RATE_CONFIRM_PERCENT = 10

/** The change from `from` to `to` as a percentage of `from`; positive is a rise. */
function rateChangePercent(from: number, to: number) {
  return Math.round(((to - from) / from) * 100 * 1e6) / 1e6
}

function signedPercent(percent: number) {
  const size = Math.abs(percent)
  return `${percent < 0 ? '−' : '+'}${size >= 100 ? Math.round(size) : Number(size.toFixed(1))}%`
}

// "2 students · 1 consultancy · Japan" — who is going without an "≈" today, most affected first.
function missingRateReach(m: MissingRate) {
  const parts: string[] = []
  if (m.student_count) parts.push(`${m.student_count} student${m.student_count === 1 ? '' : 's'}`)
  if (m.consultancy_count) parts.push(`${m.consultancy_count} consultanc${m.consultancy_count === 1 ? 'y' : 'ies'}`)
  const names = m.countries.slice(0, 3).join(', ')
  if (names) parts.push(m.countries.length > 3 ? `${names} +${m.countries.length - 3} more` : names)
  return parts.join(' · ')
}

/**
 * The rates editor, shared by Finance → Exchange Rates and Settings → Exchange Rates. Only staff
 * with the `finance` permission may change a rate (the server refuses anyone else), so the Settings
 * tab passes `readOnly` for anyone without it: the same table and the same figures, no edit controls.
 */
export function ExchangeRatesTab({ readOnly = false }: { readOnly?: boolean }) {
  const rates = useExchangeRates()
  const missing = useMissingExchangeRates()
  const [editing, setEditing] = useState<ExchangeRate | null>(null)
  // null = closed; '' = a blank Add Currency; a code = "Add rate" from the missing list.
  const [adding, setAdding] = useState<string | null>(null)
  const [showAllMissing, setShowAllMissing] = useState(false)
  // The rupee never needs a rate, so it is never "missing" one either.
  const missingRows = (missing.data ?? []).filter((m) => m.currency !== BASE_CURRENCY)
  const shownMissing = showAllMissing ? missingRows : missingRows.slice(0, 5)
  const editableRates = (rates.data ?? []).filter((r) => r.currency !== BASE_CURRENCY)
  const staleCount = editableRates.filter((r) => (rateAgeDays(r.updated_at) ?? 0) > STALE_RATE_DAYS).length
  const rows: ExchangeRate[] = rates.data ? [{ currency: BASE_CURRENCY, inr_per_unit: 1 }, ...editableRates] : []

  const columns: TableColumn<ExchangeRate>[] = [
    {
      key: 'currency',
      header: 'Currency',
      render: (r) => <span className="font-medium text-text-primary">{r.currency}</span>,
    },
    {
      key: 'rate',
      header: '₹ per unit',
      render: (r) => <span className="tabular-nums text-text-secondary">₹{r.inr_per_unit}</span>,
    },
    {
      key: 'updated',
      header: 'Last updated',
      hideBelow: 'sm',
      render: (r) => {
        if (r.currency === BASE_CURRENCY) return <span className="text-text-secondary">—</span>
        const days = rateAgeDays(r.updated_at)
        if (days == null) return <span className="text-text-secondary">—</span>
        const stale = days > STALE_RATE_DAYS
        return (
          <span className="flex items-center gap-sm">
            <span className={stale ? 'text-warning' : 'text-text-secondary'}>
              {formatDate(r.updated_at!)} · {agoLabel(days)}
            </span>
            {stale && <Badge color="warning">Check rate</Badge>}
          </span>
        )
      },
    },
    // Dropped when the tab is read-only (see `shownColumns`).
    {
      key: 'actions',
      header: '',
      align: 'right',
      render: (r) =>
        r.currency === BASE_CURRENCY ? (
          <span className="text-caption text-text-secondary">Base currency · fixed at 1</span>
        ) : (
          <button
            type="button"
            onClick={() => setEditing(r)}
            aria-label={`Edit ${r.currency} rate`}
            title="Edit"
            className="flex h-9 w-9 items-center justify-center rounded-md text-text-secondary hover:bg-background hover:text-text-primary"
          >
            <Pencil className="h-4 w-4" />
          </button>
        ),
    },
  ]
  const shownColumns = readOnly ? columns.filter((c) => c.key !== 'actions') : columns

  return (
    <div className="flex flex-col gap-md">
      <div className="flex items-start justify-between gap-md">
        <div className="flex max-w-2xl flex-col gap-xs">
          <p className="text-body-sm text-text-secondary">
            Set by hand — there is no live feed. Fees always show in their own currency; these rates turn them into the
            &ldquo;≈&rdquo; amount a student or staff member sees in theirs, and let the fee filter compare courses
            priced in different currencies. A change applies straight away. Rates older than {STALE_RATE_DAYS} days are
            flagged
            {staleCount > 0 && (
              <span className="font-medium text-warning">
                {' '}
                — {staleCount} {staleCount === 1 ? 'needs' : 'need'} a check
              </span>
            )}
            .
          </p>
          <SettingsUsedIn
            places={['≈ amounts for students & staff', 'Fee filter & sort', 'Commission totals', 'Currency pickers']}
          />
        </div>
        {!readOnly && (
          <Button size="sm" onClick={() => setAdding('')}>
            Add Currency
          </Button>
        )}
      </div>
      {readOnly && (
        <p className="text-body-sm font-medium text-text-primary">Exchange rates are managed by the finance team.</p>
      )}
      {missingRows.length > 0 && (
        <Card>
          <div className="flex flex-col gap-sm">
            <div className="flex items-baseline justify-between gap-md">
              <p className="text-body font-medium text-text-primary">
                {missingRows.length} {missingRows.length === 1 ? 'currency' : 'currencies'} in use with no rate
              </p>
              {missingRows.length > 5 && (
                <button
                  type="button"
                  onClick={() => setShowAllMissing((v) => !v)}
                  className="text-body-sm font-medium text-primary hover:underline"
                >
                  {showAllMissing ? 'Show fewer' : `Show all ${missingRows.length}`}
                </button>
              )}
            </div>
            <p className="text-body-sm text-text-secondary">
              Students living in these countries, and consultancies based there, see no &ldquo;≈&rdquo; amounts until a
              rate is added. Most affected first.
            </p>
            <ul className="flex flex-col divide-y divide-border">
              {shownMissing.map((m) => (
                <li key={m.currency} className="flex items-center justify-between gap-md py-sm">
                  <div className="flex min-w-0 flex-col">
                    <span className="font-medium text-text-primary">{m.currency}</span>
                    <span className="truncate text-caption text-text-secondary" title={m.countries.join(', ')}>
                      {missingRateReach(m)}
                    </span>
                  </div>
                  {!readOnly && (
                    <Button size="sm" variant="secondary" onClick={() => setAdding(m.currency)}>
                      Add rate
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          </div>
        </Card>
      )}
      <Table
        columns={shownColumns}
        rows={rows}
        rowKey={(r) => r.currency}
        loading={rates.isLoading}
        error={rates.isError ? 'Could not load exchange rates.' : undefined}
        emptyMessage="No rates yet."
      />
      {!readOnly && (editing || adding !== null) && (
        <RateFormModal
          rate={editing ?? undefined}
          presetCurrency={adding || undefined}
          onClose={() => {
            setEditing(null)
            setAdding(null)
          }}
        />
      )}
    </div>
  )
}

function RateFormModal({
  rate,
  presetCurrency,
  onClose,
}: {
  rate?: ExchangeRate
  presetCurrency?: string
  onClose: () => void
}) {
  const upsert = useUpsertExchangeRate()
  const rates = useExchangeRates()
  const [currency, setCurrency] = useState(rate?.currency ?? presetCurrency ?? '')
  const [inrPerUnit, setInrPerUnit] = useState(rate ? String(rate.inr_per_unit) : '')
  const [confirming, setConfirming] = useState(false)
  const code = currency.trim().toUpperCase()
  const isBase = code === BASE_CURRENCY
  const next = Number(inrPerUnit)
  const valid = code.length === 3 && next > 0 && !isBase
  // The rate being replaced: the row being edited, or — when "Add Currency" is given a code the
  // table already holds — that row, since saving it is an overwrite all the same.
  const current = rate ?? (rates.data ?? []).find((r) => r.currency === code)
  const changePercent = current && current.inr_per_unit > 0 ? rateChangePercent(current.inr_per_unit, next) : null

  function save() {
    upsert.mutate(
      { currency: code, inr_per_unit: next },
      {
        onSuccess: () => {
          onClose()
          showToast(current ? `${code} rate updated` : `${code} rate added`)
        },
        // Back to the form, where the server's refusal is shown beside Save.
        onError: () => setConfirming(false),
      },
    )
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!valid) return
    if (changePercent !== null && Math.abs(changePercent) > RATE_CONFIRM_PERCENT) {
      setConfirming(true)
      return
    }
    save()
  }

  return (
    <Modal
      onClose={onClose}
      title={rate ? `Edit ${rate.currency} Rate` : presetCurrency ? `Add ${presetCurrency} Rate` : 'Add Currency'}
      widthRem={24}
      footer={
        <>
          {upsert.isError && <p className="mr-auto self-center text-body-sm text-error">{upsert.error.message}</p>}
          <Button type="submit" form="rate-form" loading={upsert.isPending} disabled={!valid}>
            Save Rate
          </Button>
        </>
      }
    >
      <form id="rate-form" onSubmit={handleSubmit} className="flex flex-col gap-md">
        <TextField
          label="Currency code"
          required
          value={currency}
          onChange={(e) => setCurrency(e.target.value.toUpperCase())}
          placeholder="e.g. CAD"
          disabled={Boolean(rate || presetCurrency)}
          error={isBase ? 'The rupee is the base currency. It is fixed at 1 and has no rate to set.' : undefined}
        />
        {/* `step="any"`: most of the currencies missing a rate are worth under ₹1 (ALL ≈ 0.9,
            VND ≈ 0.0033), and a number input's default step of 1 refused every one of them. */}
        <TextField
          label="₹ per unit of this currency"
          required
          type="number"
          step="any"
          min="0"
          value={inrPerUnit}
          onChange={(e) => setInrPerUnit(e.target.value)}
        />
      </form>
      {confirming && current && changePercent !== null && (
        <Modal
          onClose={() => setConfirming(false)}
          title={`Change the ${code} rate by ${signedPercent(changePercent)}?`}
          widthRem={26}
          footer={
            <>
              <Button variant="secondary" onClick={() => setConfirming(false)} disabled={upsert.isPending}>
                Cancel
              </Button>
              <Button loading={upsert.isPending} onClick={save}>
                Confirm
              </Button>
            </>
          }
        >
          <div className="flex flex-col gap-sm">
            <dl className="grid grid-cols-[auto_1fr] gap-x-md gap-y-xs text-body-sm">
              <dt className="text-text-secondary">Currency</dt>
              <dd className="font-medium text-text-primary">{code}</dd>
              <dt className="text-text-secondary">Current rate</dt>
              <dd className="font-medium tabular-nums text-text-primary">₹{current.inr_per_unit}</dd>
              <dt className="text-text-secondary">New rate</dt>
              <dd className="font-medium tabular-nums text-text-primary">₹{next}</dd>
              <dt className="text-text-secondary">Change</dt>
              <dd className="font-medium tabular-nums text-text-primary">{signedPercent(changePercent)}</dd>
            </dl>
            <p className="text-body-sm text-text-secondary">
              A change of more than {RATE_CONFIRM_PERCENT}% is unusual for a rate kept by hand. It applies straight
              away, to every &ldquo;≈&rdquo; amount and to every payment declared from now on.
            </p>
          </div>
        </Modal>
      )}
    </Modal>
  )
}
