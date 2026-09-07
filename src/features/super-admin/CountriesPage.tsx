import { useMemo, useState, type FormEvent } from 'react'
import { Pencil } from 'lucide-react'
import { AdminShell } from '@/features/auth/AdminShell'
import { Card } from '@/components/Card'
import { Button } from '@/components/Button'
import { Badge } from '@/components/Badge'
import { TextField } from '@/components/TextField'
import { Modal } from '@/components/Modal'
import { Table, type TableColumn } from '@/components/Table'
import { CompactSelect } from '@/components/CompactSelect'
import { StopPropagation } from '@/components/StopPropagation'
import { Toggle } from '@/components/Toggle'
import { RichTextEditor } from '@/components/RichTextEditor'
import {
  useCountrySettings,
  useCreateCountry,
  useDeleteCountry,
  useUpdateCountryCurrency,
} from '@/queries/countries'
import {
  useCountryContent,
  useDeleteCountryContent,
  useSaveCountryContent,
  type CountryContent,
} from '@/queries/countryContent'
import { formatDate } from '@/lib/time'
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

/**
 * Countries — the shared reference list AND the editorial guide for each destination, on one page
 * (user, 2026-09-07: "I think having one page for both is more efficient").
 *
 * They were already ONE record: guides were merged into the country row on 2026-08-26, because the
 * relationship is strictly 1:1 and a guide has no identity without its country. Only the console
 * stayed split — two sidebar entries, two tables listing the same countries, and an admin who
 * wanted to add a country and write about it had to visit both. This closes that last gap, so the
 * page now shows the whole truth about a destination in one row: what students pick it from, what
 * currency they see its fees in, and what they read before choosing it.
 *
 * Deliberately NOT merged: the two API paths. `GET /countries` still returns plain names because
 * that is what ~250 dropdown call-sites across both products consume, and the guide rides on its
 * own endpoint. One screen over two endpoints is cheap; reshaping the list every picker depends on
 * is not.
 */
export function CountriesPage() {
  const countries = useCountrySettings()
  const content = useCountryContent()
  const createCountry = useCreateCountry()
  const [name, setName] = useState('')
  const [search, setSearch] = useState('')
  const [editingGuide, setEditingGuide] = useState<string | null>(null)

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!name.trim()) return
    createCountry.mutate(name.trim(), { onSuccess: () => setName('') })
  }

  // Every country gets a row whether or not anyone has written about it — listing only the
  // written ones would hide the gap the guide half of this page exists to close.
  const rows = useMemo(() => {
    const byCountry = new Map((content.data ?? []).map((c) => [c.country, c]))
    return (countries.data ?? []).map((country) => ({ ...country, guide: byCountry.get(country.name) }))
  }, [countries.data, content.data])

  const needle = search.trim().toLowerCase()
  const visible = rows.filter(
    (c) => !needle || c.name.toLowerCase().includes(needle) || (c.iso2 ?? '').toLowerCase().includes(needle),
  )
  const published = rows.filter((r) => r.guide?.published).length
  const written = rows.filter((r) => r.guide).length

  const columns: TableColumn<(typeof rows)[number]>[] = [
    { key: 'name', header: 'Country', render: (row) => <span className="font-medium">{row.name}</span> },
    {
      key: 'iso2',
      header: 'ISO',
      hideBelow: 'sm',
      render: (row) => <span className="text-text-secondary">{row.iso2 ?? '—'}</span>,
    },
    { key: 'currency', header: 'Default fee currency', render: (row) => <DefaultCurrencyCell row={row} /> },
    {
      key: 'guide',
      header: 'Guide',
      render: (row) =>
        !row.guide ? (
          <Badge color="secondary">Not written</Badge>
        ) : row.guide.published ? (
          <Badge color="success">Published</Badge>
        ) : (
          <Badge color="warning">Draft</Badge>
        ),
    },
    {
      key: 'guide_updated',
      header: 'Guide updated',
      hideBelow: 'sm',
      render: (row) => (
        <span className="text-text-secondary">{row.guide?.updated_at ? formatDate(row.guide.updated_at) : '—'}</span>
      ),
    },
    {
      key: 'actions',
      header: '',
      align: 'right',
      render: (row) => (
        <StopPropagation className="flex items-center justify-end gap-xs">
          <button
            type="button"
            onClick={() => setEditingGuide(row.name)}
            aria-label={`Edit ${row.name} guide`}
            title="Edit guide"
            className="flex h-9 w-9 items-center justify-center rounded-md text-text-secondary hover:bg-background hover:text-text-primary"
          >
            <Pencil className="h-4 w-4" />
          </button>
          <DeleteCountryTrigger country={row.name} />
        </StopPropagation>
      ),
    },
  ]

  return (
    <AdminShell>
      <div className="flex flex-col gap-lg">
        <div>
          <h1 className="text-h1 text-text-primary">Countries</h1>
          <p className="text-body-sm text-text-secondary">
            The shared list every consultancy picks from for Countries Served, and every catalog country field
            (campuses, commission rates, redemption partners) draws from. Each country&apos;s default fee currency is
            what a student living there sees course fees in until they pick another in the app, and its guide is what
            they read before adding it to their target countries — {published} of {rows.length} published
            {written > published && `, ${written - published} in draft`}.
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
          rows={visible}
          rowKey={(row) => row.name}
          loading={countries.isLoading || content.isLoading}
          error={countries.isError || content.isError ? 'Could not load countries.' : undefined}
          emptyMessage={needle ? 'No countries match.' : 'No countries yet.'}
          search={{ value: search, onChange: setSearch, placeholder: 'Search countries…' }}
          onRowClick={(row) => setEditingGuide(row.name)}
          filters={
            <Badge color="secondary">
              {visible.length} of {rows.length}
            </Badge>
          }
        />

        {editingGuide && (
          <GuideEditorModal
            country={editingGuide}
            entry={(content.data ?? []).find((c) => c.country === editingGuide)}
            onClose={() => setEditingGuide(null)}
          />
        )}
      </div>
    </AdminShell>
  )
}

// One row's currency control. Saves on change — a per-row "Save" button for a single select is
// more chrome than the decision deserves, and the mutation invalidates the list so the row
// re-renders with what the server actually stored.
function DefaultCurrencyCell({ row }: { row: CountrySetting }) {
  const update = useUpdateCountryCurrency()
  const options = CURRENCY_OPTIONS.includes(row.default_currency)
    ? CURRENCY_OPTIONS
    : [row.default_currency, ...CURRENCY_OPTIONS]
  return (
    <StopPropagation className="flex items-center gap-xs">
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
    </StopPropagation>
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

function GuideEditorModal({
  country,
  entry,
  onClose,
}: {
  country: string
  entry?: CountryContent
  onClose: () => void
}) {
  const save = useSaveCountryContent()
  const [summary, setSummary] = useState(entry?.summary ?? '')
  const [bodyHtml, setBodyHtml] = useState(entry?.body_html ?? '')
  const [published, setPublished] = useState(entry?.published ?? false)

  function handleSave() {
    save.mutate({ country, summary: summary.trim(), body_html: bodyHtml, published }, { onSuccess: () => onClose() })
  }

  return (
    <Modal
      onClose={onClose}
      title={`${country} — Country Guide`}
      widthRem={52}
      footer={
        <>
          {save.isError && <p className="mr-auto self-center text-body-sm text-error">{save.error.message}</p>}
          <div className="mr-auto flex items-center gap-sm self-center">
            <Toggle checked={published} onChange={setPublished} label={`Publish ${country} guide`} />
            <span className="text-body-sm text-text-secondary">
              {published ? 'Visible to students' : 'Draft — students see nothing'}
            </span>
          </div>
          {/* Deleting the WRITE-UP lives in here, not on the row (2026-09-07). On the merged page
              the row already carries "Remove {country}", which pulls the country out of every
              dropdown on the platform; two destructive controls side by side, one clearing a
              paragraph and one unlisting a destination, is a mis-click waiting to happen. Inside
              the editor there is no ambiguity about what is being deleted. */}
          {entry && <DeleteGuideTrigger country={country} onDeleted={onClose} />}
          <Button onClick={handleSave} loading={save.isPending}>
            Save
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-md">
        <TextField
          label="Summary"
          value={summary}
          onChange={(e) => setSummary(e.target.value)}
          placeholder="One line under the country name when a student opens the guide"
        />
        <div className="flex flex-col gap-xs">
          {/* A <label> can't reach a contentEditable div, so the visible caption is a span and
              the accessible name goes in via the editor's own ariaLabel prop. */}
          <span className="text-body-sm font-medium text-text-primary">Write-up</span>
          <RichTextEditor
            value={bodyHtml}
            onChange={setBodyHtml}
            ariaLabel="Country write-up"
            placeholder="Why a student should consider this country — costs, work rights, what happens after they graduate…"
          />
          <p className="text-caption text-text-secondary">
            Headings, bold, lists, quotes and links are kept. Anything else is stripped when you save, so the app
            renders it the same way every time.
          </p>
        </div>
      </div>
    </Modal>
  )
}

function DeleteGuideTrigger({ country, onDeleted }: { country: string; onDeleted: () => void }) {
  const remove = useDeleteCountryContent()
  const [confirming, setConfirming] = useState(false)

  return (
    <>
      <Button variant="secondary" onClick={() => setConfirming(true)}>
        Delete write-up
      </Button>
      {confirming && (
        <Modal
          onClose={() => setConfirming(false)}
          title="Remove Country Guide"
          widthRem={26}
          footer={
            <>
              <Button variant="secondary" onClick={() => setConfirming(false)}>
                Cancel
              </Button>
              <Button
                variant="destructive"
                loading={remove.isPending}
                onClick={() =>
                  remove.mutate(country, {
                    onSuccess: () => {
                      setConfirming(false)
                      onDeleted()
                    },
                  })
                }
              >
                Remove
              </Button>
            </>
          }
        >
          <p className="text-body text-text-primary">
            Delete the write-up for <strong>{country}</strong>? The country itself stays in the shared list. Students
            will stop seeing the guide immediately, and the text is not recoverable.
          </p>
        </Modal>
      )}
    </>
  )
}
