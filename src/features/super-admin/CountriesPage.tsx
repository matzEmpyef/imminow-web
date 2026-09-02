import { useState, type FormEvent } from 'react'
import { AdminShell } from '@/features/auth/AdminShell'
import { Card } from '@/components/Card'
import { Button } from '@/components/Button'
import { Badge } from '@/components/Badge'
import { TextField } from '@/components/TextField'
import { Modal } from '@/components/Modal'
import { Table, type TableColumn } from '@/components/Table'
import { CompactSelect } from '@/components/CompactSelect'
import {
  useCountrySettings,
  useCreateCountry,
  useDeleteCountry,
  useUpdateCountryCurrency,
} from '@/queries/countries'
import type { components } from '@/api/schema'

type CountrySetting = components['schemas']['CountrySetting']

// The currencies a country can default to (2026-09-02). Every code the exchange-rate table
// already holds plus the major source-market units — a country defaulting to a currency with no
// rate would show its students every fee as nothing at all, so the list is deliberately closed
// rather than a free-text field. INR is the platform's own fallback for a country nobody has set.
const CURRENCY_OPTIONS = [
  'AED', 'AUD', 'BDT', 'BRL', 'CAD', 'CHF', 'CNY', 'EGP', 'EUR', 'GBP', 'GHS', 'IDR', 'INR', 'JPY', 'KES',
  'KRW', 'LKR', 'MAD', 'MXN', 'MYR', 'NGN', 'NPR', 'NZD', 'PHP', 'PKR', 'SAR', 'SEK', 'SGD', 'TRY', 'UGX',
  'USD', 'VND', 'ZAR',
]

// One row's currency control. Saves on change — a per-row "Save" button for a single select is
// more chrome than the decision deserves, and the mutation invalidates the list so the row
// re-renders with what the server actually stored.
function DefaultCurrencyCell({ row }: { row: CountrySetting }) {
  const update = useUpdateCountryCurrency()
  const options = CURRENCY_OPTIONS.includes(row.default_currency)
    ? CURRENCY_OPTIONS
    : [row.default_currency, ...CURRENCY_OPTIONS]
  return (
    <div className="flex items-center gap-xs">
      <CompactSelect
        label={`Default currency for ${row.name}`}
        dense
        value={row.default_currency}
        disabled={update.isPending}
        onChange={(e) => update.mutate({ name: row.name, currency: e.target.value })}
      >
        {options.map((code) => (
          <option key={code} value={code}>
            {code}
          </option>
        ))}
      </CompactSelect>
      {update.isError && <span className="text-caption text-error">Not saved</span>}
    </div>
  )
}

// User-requested (2026-08-15) — "wherever there is delete, confirm popup is needed." Was a bare
// ✕ that removed the country immediately.
function DeleteCountryTrigger({ country }: { country: string }) {
  const deleteCountry = useDeleteCountry()
  const [confirming, setConfirming] = useState(false)

  return (
    <>
      <button
        onClick={() => setConfirming(true)}
        className="text-caption text-error hover:underline"
        aria-label={`Remove ${country}`}
      >
        ✕
      </button>
      {confirming && (
        <Modal
          onClose={() => setConfirming(false)}
          title="Remove Country"
          widthRem={24}
          footer={
            <>
              <Button variant="secondary" onClick={() => setConfirming(false)}>
                Cancel
              </Button>
              <Button
                variant="destructive"
                loading={deleteCountry.isPending}
                onClick={() => deleteCountry.mutate(country, { onSuccess: () => setConfirming(false) })}
              >
                Remove
              </Button>
            </>
          }
        >
          <p className="text-body-sm text-text-secondary">
            Remove <span className="font-medium text-text-primary">{country}</span> from the shared list? Consultancies
            and catalog entries already using it are unaffected.
          </p>
        </Modal>
      )}
    </>
  )
}

// User-requested — the shared countries list (Consultancy Profile's Countries Served multiselect,
// Colleges & Courses' campus country, Commission Rates' destination country, Redemption Partners'
// location country) needed a place to actually manage it, not just read it. Same list+add+delete
// shape the old Tag Management page used before it got folded into Consultancy Management.
export function CountriesPage() {
  const countries = useCountrySettings()
  const createCountry = useCreateCountry()
  const [name, setName] = useState('')
  const [search, setSearch] = useState('')

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!name.trim()) return
    createCountry.mutate(name.trim(), { onSuccess: () => setName('') })
  }

  const needle = search.trim().toLowerCase()
  const rows = (countries.data ?? []).filter(
    (c) => !needle || c.name.toLowerCase().includes(needle) || (c.iso2 ?? '').toLowerCase().includes(needle),
  )

  // A table, not a wrap of badges, since 2026-09-02: each country now carries a setting (its
  // default fee currency for resident students) and a chip has nowhere to put a control.
  const columns: TableColumn<CountrySetting>[] = [
    { key: 'name', header: 'Country', render: (row) => <span className="font-medium">{row.name}</span> },
    {
      key: 'iso2',
      header: 'ISO',
      hideBelow: 'sm',
      render: (row) => <span className="text-text-secondary">{row.iso2 ?? '—'}</span>,
    },
    { key: 'currency', header: 'Default fee currency', render: (row) => <DefaultCurrencyCell row={row} /> },
    { key: 'remove', header: '', align: 'right', render: (row) => <DeleteCountryTrigger country={row.name} /> },
  ]

  return (
    <AdminShell>
      <div className="flex flex-col gap-lg">
        <div>
          <h1 className="text-h1 text-text-primary">Countries</h1>
          <p className="text-body-sm text-text-secondary">
            The shared list every consultancy picks from for Countries Served, and every catalog country field
            (campuses, commission rates, redemption partners) draws from. Each country&apos;s default fee currency
            is what a student living there sees course fees in until they pick another in the app.
          </p>
        </div>

        <Card className="max-w-[32rem]">
          <form onSubmit={handleSubmit} className="flex items-end gap-sm">
            <TextField label="New country" value={name} onChange={(e) => setName(e.target.value)} className="flex-1" />
            <Button type="submit" loading={createCountry.isPending} disabled={!name.trim()}>
              Add
            </Button>
          </form>
          {createCountry.isError && <p className="mt-sm text-body-sm text-error">{createCountry.error.message}</p>}
        </Card>

        <Table
          columns={columns}
          rows={rows}
          rowKey={(row) => row.name}
          loading={countries.isLoading}
          error={countries.isError ? countries.error.message : undefined}
          emptyMessage={needle ? 'No countries match.' : 'No countries yet.'}
          search={{ value: search, onChange: setSearch, placeholder: 'Search countries…' }}
          filters={
            <Badge color="secondary">
              {rows.length} of {countries.data?.length ?? 0}
            </Badge>
          }
        />
      </div>
    </AdminShell>
  )
}
