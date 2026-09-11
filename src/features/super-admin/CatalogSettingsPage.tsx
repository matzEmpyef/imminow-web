import { useMemo, useState, type FormEvent } from 'react'
import { Archive, ArchiveRestore, ChevronDown, ChevronUp, Pencil, Trash2 } from 'lucide-react'
import { CompactSelect } from '@/components/CompactSelect'
import { FilterChip } from '@/components/FilterChip'
import { CountryFlag } from '@/components/CountryFlag'
import { StopPropagation } from '@/components/StopPropagation'
import { RichTextEditor } from '@/components/RichTextEditor'
import { AdminShell } from '@/features/auth/AdminShell'
import { SelectField } from '@/components/SelectField'
import { Button } from '@/components/Button'
import { Badge } from '@/components/Badge'
import { Card } from '@/components/Card'
import { TextField } from '@/components/TextField'
import { Toggle } from '@/components/Toggle'
import { Modal } from '@/components/Modal'
import { Table, type TableColumn } from '@/components/Table'
import {
  useCreateExam,
  useExams,
  useExchangeRates,
  useMissingExchangeRates,
  useUpdateExam,
  useUpsertExchangeRate,
  usePlatformSettings,
  useUpdatePlatformSettings,
} from '@/queries/catalogSettings'
import { useCreateStudyLevel, useDeleteStudyLevel, useStudyLevels, useUpdateStudyLevel } from '@/queries/studyLevels'
import { FieldsOfStudyTab } from './FieldsOfStudyTab'
import { SettingsUsedIn } from './SettingsUsedIn'
import {
  useCountrySettings,
  useUpdateCountryWindow,
  useCreateCountry,
  useDeleteCountry,
  useSetCountryActive,
  useUpdateCountryCurrency,
} from '@/queries/countries'
import {
  useCountryContent,
  useDeleteCountryContent,
  useSaveCountryContent,
  type CountryContent,
} from '@/queries/countryContent'
import { formatDate } from '@/lib/time'
import { showToast } from '@/lib/toast'
import type { components } from '@/api/schema'

type Exam = components['schemas']['Exam']
type ExchangeRate = components['schemas']['ExchangeRate']
type StudyLevel = components['schemas']['StudyLevel']
type CountrySetting = components['schemas']['CountrySetting']

const TABS = ['Countries', 'Exams', 'Study Levels', 'Fields of Study', 'Exchange Rates', 'Course Popularity'] as const

const SCORE_TYPES = [
  { value: 'band', label: 'Band (e.g. IELTS 0–9)' },
  { value: 'score', label: 'Score (e.g. GRE, TOEFL)' },
  { value: 'percentile', label: 'Percentile (e.g. JEE, CAT)' },
  { value: 'rank', label: 'Rank (e.g. NEET)' },
] as const

/**
 * Catalog Settings (COURSES_MODULE_PLAN.md §1.3/§1.5) — the two small admin-managed lists the
 * courses module reads from. Exams: one list feeds BOTH the student profile's Add-exam dropdown
 * and the course Entry Requirements form, so adding "CUET" here makes it usable everywhere with
 * no developer step. Exchange Rates: back the normalized-INR fee every search fee filter/sort
 * compares against — display always stays in the native currency.
 */
export function CatalogSettingsPage() {
  const [activeTab, setActiveTab] = useState<(typeof TABS)[number]>('Countries')

  return (
    <AdminShell>
      <div className="flex flex-col gap-lg">
        {/* "Settings", not "Catalog Settings" (user, 2026-09-07). The page had already grown
            past the catalog — Countries drives Consultancy Management's Countries Served and
            Redemption Partners' locations too, neither of which is catalog. */}
        <h1 className="text-h1 text-text-primary">Settings</h1>
        <div className="flex gap-sm border-b border-border">
          {TABS.map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => setActiveTab(tab)}
              className={`border-b-2 px-md py-sm text-body-sm font-medium ${
                activeTab === tab
                  ? 'border-primary text-primary'
                  : 'border-transparent text-text-secondary hover:text-text-primary'
              }`}
            >
              {tab}
            </button>
          ))}
        </div>
        {activeTab === 'Countries' ? (
          <CountriesTab />
        ) : activeTab === 'Exams' ? (
          <ExamsTab />
        ) : activeTab === 'Study Levels' ? (
          <StudyLevelsTab />
        ) : activeTab === 'Fields of Study' ? (
          <FieldsOfStudyTab />
        ) : activeTab === 'Exchange Rates' ? (
          <ExchangeRatesTab />
        ) : (
          <CoursePopularityTab />
        )}
      </div>
    </AdminShell>
  )
}


/**
 * Countries — the shared reference list, each country's default fee currency, and its editorial
 * guide, in one row (moved in here 2026-09-07 at the user's request; the guides had already been
 * merged into the countries page the same day, and the countries page into Settings after it).
 *
 * DISABLE vs DELETE, because the difference is not obvious and one of them is destructive.
 * Disabling drops the country from `GET /countries` — the list every picker on both products
 * reads — so nobody can newly choose it, while every campus, `countries_served` entry and
 * `target_countries` entry that already names it keeps working and every course in it stays
 * searchable. Deleting is a hard delete with no reference check: it also destroys the country's
 * guide, because the write-up lives on the same row. Disable is what an admin almost always
 * means, so it is the row's primary control and delete is tucked behind a confirm.
 */
function CountriesTab() {
  const countries = useCountrySettings()
  const content = useCountryContent()
  const rates = useExchangeRates()
  const [search, setSearch] = useState('')
  const [offeredFilter, setOfferedFilter] = useState<'' | 'offered' | 'not_offered'>('')
  const [guideFilter, setGuideFilter] = useState<'' | 'published' | 'draft' | 'none'>('')
  const [noRateOnly, setNoRateOnly] = useState(false)
  const [unreviewedOnly, setUnreviewedOnly] = useState(false)
  const [adding, setAdding] = useState(false)
  const [editingGuide, setEditingGuide] = useState<string | null>(null)

  // Every country gets a row whether or not anyone has written about it — listing only the
  // written ones would hide the gap the guide half of this tab exists to close. `hasRate` is
  // assumed true until the rates load, so 91 "No rate" chips do not flash in and out.
  const rows = useMemo(() => {
    const byCountry = new Map((content.data ?? []).map((c) => [c.country, c]))
    const rated = rates.data ? new Set(rates.data.map((r) => r.currency)) : null
    return (countries.data ?? []).map((country) => ({
      ...country,
      guide: byCountry.get(country.name),
      hasRate: rated ? rated.has(country.default_currency) : true,
      waitsReviewed: country.offer_turnaround_days_reviewed !== false && country.expected_close_days_reviewed !== false,
    }))
  }, [countries.data, content.data, rates.data])

  const needle = search.trim().toLowerCase()
  const visible = rows.filter((c) => {
    if (needle && !c.name.toLowerCase().includes(needle) && !(c.iso2 ?? '').toLowerCase().includes(needle)) return false
    if (offeredFilter === 'offered' && c.active === false) return false
    if (offeredFilter === 'not_offered' && c.active !== false) return false
    if (guideFilter === 'published' && !c.guide?.published) return false
    if (guideFilter === 'draft' && (!c.guide || c.guide.published)) return false
    if (guideFilter === 'none' && c.guide) return false
    if (noRateOnly && c.hasRate) return false
    if (unreviewedOnly && c.waitsReviewed) return false
    return true
  })
  const offered = rows.filter((r) => r.active !== false).length
  const published = rows.filter((r) => r.guide?.published).length
  const noRate = rows.filter((r) => !r.hasRate).length
  const unreviewed = rows.filter((r) => !r.waitsReviewed).length
  const filtering = Boolean(needle || offeredFilter || guideFilter || noRateOnly || unreviewedOnly)

  const columns: TableColumn<(typeof rows)[number]>[] = [
    {
      key: 'name',
      header: 'Country',
      render: (row) => (
        <span className="flex items-center gap-sm">
          <CountryFlag iso2={row.iso2} />
          <span className={row.active === false ? 'text-text-secondary' : 'font-medium text-text-primary'}>
            {row.name}
          </span>
        </span>
      ),
    },
    {
      key: 'iso2',
      header: 'ISO',
      hideBelow: 'sm',
      render: (row) => <span className="text-text-secondary">{row.iso2 ?? '—'}</span>,
    },
    {
      key: 'currency',
      header: 'Fee currency',
      render: (row) => <DefaultCurrencyCell row={row} hasRate={row.hasRate} />,
    },
    {
      key: 'windows',
      header: 'Waits (days)',
      hideBelow: 'md',
      render: (row) => <CountryWindowCells row={row} />,
    },
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
      key: 'offered',
      header: 'Offered',
      render: (row) => <CountryActiveToggle row={row} />,
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
    <div className="flex flex-col gap-md">
      <div className="flex items-start justify-between gap-md">
        <div className="flex max-w-2xl flex-col gap-xs">
          <p className="text-body-sm text-text-secondary">
            The shared list of countries. A country&apos;s fee currency is what a student living there sees course
            fees in until they pick another in the app; its guide is what they read before adding it to their target
            countries. {offered} of {rows.length} offered · {published} guides published.
          </p>
          <SettingsUsedIn
            places={[
              'Countries Served',
              'Campus country',
              'Commission rates',
              'Redemption partners',
              'Sentpo target countries',
              'Student fee currency',
            ]}
          />
        </div>
        <Button size="sm" onClick={() => setAdding(true)}>
          Add Country
        </Button>
      </div>
      <div className="flex flex-col gap-xs rounded-md border border-border bg-background p-md text-body-sm text-text-secondary">
        <p className="font-medium text-text-primary">What the two waits do</p>
        <p>
          <span className="font-medium text-text-primary">Offer reply</span> (default 30 days) — counted from when
          the consultancy marks a college as applied. When it runs out with no decision recorded, the student is
          asked in the Sentpo app whether the college has replied (at most twice), and the case appears in
          Support → Student follow-ups as &ldquo;Applied, no movement&rdquo;.
        </p>
        <p>
          <span className="font-medium text-text-primary">Case closes</span> (default 120 days) — counted from when
          a college offer is accepted to the case closing (visa, decision, departure). immiNow&rsquo;s commission
          only falls due when a case closes as a success, so when this runs out with the case still open, it
          appears in Finance → Payment follow-ups as &ldquo;Accepted, still open&rdquo; — worth checking whether the
          student has already travelled and the consultancy should close it.
        </p>
        <p>
          Neither number changes any amount — they only decide when someone is asked or flagged. Both are starting
          guesses; set real figures for the countries in use.
        </p>
      </div>
      <Table
        columns={columns}
        rows={visible}
        rowKey={(row) => row.name}
        loading={countries.isLoading || content.isLoading}
        error={countries.isError || content.isError ? 'Could not load countries.' : undefined}
        emptyMessage={filtering ? 'No countries match.' : 'No countries yet.'}
        search={{ value: search, onChange: setSearch, placeholder: 'Search countries…' }}
        filters={
          <>
            <CompactSelect
              label="Offered"
              value={offeredFilter}
              onChange={(e) => setOfferedFilter(e.target.value as typeof offeredFilter)}
            >
              <option value="">Offered or not</option>
              <option value="offered">Offered</option>
              <option value="not_offered">Not offered</option>
            </CompactSelect>
            <CompactSelect
              label="Guide"
              value={guideFilter}
              onChange={(e) => setGuideFilter(e.target.value as typeof guideFilter)}
            >
              <option value="">Any guide</option>
              <option value="published">Guide published</option>
              <option value="draft">Guide in draft</option>
              <option value="none">No guide</option>
            </CompactSelect>
          </>
        }
        quickFilters={
          <>
            <FilterChip label={`No exchange rate (${noRate})`} active={noRateOnly} onChange={setNoRateOnly} />
            <FilterChip
              label={`Waits not reviewed (${unreviewed})`}
              active={unreviewedOnly}
              onChange={setUnreviewedOnly}
            />
          </>
        }
        onRowClick={(row) => setEditingGuide(row.name)}
      />
      {adding && <AddCountryModal onClose={() => setAdding(false)} />}
      {editingGuide && (
        <GuideEditorModal
          country={editingGuide}
          entry={(content.data ?? []).find((c) => c.country === editingGuide)}
          onClose={() => setEditingGuide(null)}
        />
      )}
    </div>
  )
}

function AddCountryModal({ onClose }: { onClose: () => void }) {
  const createCountry = useCreateCountry()
  const [name, setName] = useState('')

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!name.trim()) return
    const trimmedName = name.trim()
    createCountry.mutate(trimmedName, {
      onSuccess: () => {
        onClose()
        showToast(`${trimmedName} added`)
      },
    })
  }

  return (
    <Modal
      onClose={onClose}
      title="Add Country"
      widthRem={26}
      footer={
        <>
          {createCountry.isError && (
            <p className="mr-auto self-center text-body-sm text-error">{createCountry.error.message}</p>
          )}
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="add-country-form" loading={createCountry.isPending} disabled={!name.trim()}>
            Add Country
          </Button>
        </>
      }
    >
      <form id="add-country-form" onSubmit={handleSubmit} className="flex flex-col gap-md">
        <TextField label="Country name" required value={name} onChange={(e) => setName(e.target.value)} />
        <p className="text-caption text-text-secondary">
          Adding it here offers it platform-wide — in Countries Served, campus country, commission rates, redemption
          partner locations and the Sentpo app&apos;s target countries. Its ISO code and flag fill in from the server
          where it knows the country; its guide can be written afterwards from this same list.
        </p>
      </form>
    </Modal>
  )
}

// Offered / not offered. A toggle rather than a menu because it is one reversible bit, and it
// saves on change like the currency select beside it — the mutation invalidates the list, so the
// row re-renders with what the server actually stored.
function CountryActiveToggle({ row }: { row: CountrySetting }) {
  const setActive = useSetCountryActive()
  return (
    <StopPropagation className="flex items-center gap-xs">
      <Toggle
        size="sm"
        checked={row.active !== false}
        onChange={(checked) => setActive.mutate({ name: row.name, active: checked })}
        label={`Offer ${row.name}`}
      />
      {setActive.isError && <span className="text-caption text-error">Not saved</span>}
    </StopPropagation>
  )
}

// One row's currency control. Saves on change — a per-row "Save" button for a single select is
// more chrome than the decision deserves.
//
// "No rate" (2026-09-11): 91 of 119 countries were seeded with a currency the rate table does not
// hold, so a student living in one gets no "≈" amount anywhere. Exchange Rates lists them too,
// ranked by who they affect; this chip is the same fact at the row it applies to.
function DefaultCurrencyCell({ row, hasRate }: { row: CountrySetting; hasRate: boolean }) {
  const update = useUpdateCountryCurrency()
  // Only currencies the Exchange Rates tab holds (2026-09-10, was a fixed list of 33 codes, most
  // without a rate): a default with no rate would give that country's users no "≈" anywhere. A
  // currency added there shows up here straight away. INR is the fallback for a country nobody set.
  const rates = useExchangeRates()
  const codes = (rates.data ?? []).map((r) => r.currency).sort()
  const options = codes.includes(row.default_currency) ? codes : [row.default_currency, ...codes]
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
      {!hasRate && (
        <span title={`No ${row.default_currency} exchange rate — students living here see no ≈ amounts`}>
          <Badge color="warning">No rate</Badge>
        </span>
      )}
      {update.isError && <span className="text-caption text-error">Not saved</span>}
    </StopPropagation>
  )
}

// The two per-country waits, named for what they measure (2026-09-11 — "Offer / Close" read as
// cryptic, and the user asked for no "default" wording on this tab). Whether anyone has actually
// chosen a number is still known (`_reviewed`); it is a filter chip above the table rather than a
// label on 119 rows.
//
// `expected_close_days` is the one that matters: its 120-day starting value is an admitted guess
// and every accepted-but-not-closed signal on the platform is derived from it.
function CountryWindowCells({ row }: { row: CountrySetting }) {
  return (
    <StopPropagation className="flex flex-col gap-xs">
      <CountryWindowField
        row={row}
        field="offer_turnaround_days"
        label="Offer reply"
        hint="Days after applying before the student is asked whether the college has replied"
        value={row.offer_turnaround_days}
      />
      <CountryWindowField
        row={row}
        field="expected_close_days"
        label="Case closes"
        hint="Days from accepting an offer to the case closing — visa, decision, departure"
        value={row.expected_close_days}
      />
    </StopPropagation>
  )
}

function CountryWindowField({
  row,
  field,
  label,
  hint,
  value,
}: {
  row: CountrySetting
  field: 'offer_turnaround_days' | 'expected_close_days'
  label: string
  hint: string
  value: number | undefined
}) {
  const update = useUpdateCountryWindow()
  const [draft, setDraft] = useState(String(value ?? ''))
  // Commits on blur, not per keystroke: a number field that PATCHes on every character sends "1",
  // "12", "120" and audits all three.
  function commit() {
    const days = Number(draft)
    if (!Number.isInteger(days) || days < 1 || days > 1000) {
      setDraft(String(value ?? ''))
      return
    }
    if (days === value) return
    update.mutate({ name: row.name, field, days })
  }
  return (
    <span className="flex items-center gap-xs whitespace-nowrap text-caption" title={hint}>
      <span className="w-20 text-text-secondary">{label}</span>
      <input
        type="number"
        min={1}
        max={1000}
        value={draft}
        aria-label={`${label} — days, ${row.name}`}
        disabled={update.isPending}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
        className="w-16 rounded-md border border-border bg-surface px-xs py-[2px] text-caption tabular-nums text-text-primary"
      />
      <span className="text-text-secondary">days</span>
      {update.isError && <span className="text-error">Not saved</span>}
    </span>
  )
}

// User-requested (2026-08-15) — "wherever there is delete, confirm popup is needed." The confirm
// now spells out what delete does that disabling does not, because the two sit on the same row.
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
          widthRem={28}
          footer={
            <>
              <Button variant="secondary" onClick={() => setConfirming(false)}>
                Cancel
              </Button>
              <Button
                variant="destructive"
                loading={deleteCountry.isPending}
                onClick={() =>
                  deleteCountry.mutate(country, {
                    onSuccess: () => {
                      setConfirming(false)
                      showToast(`${country} removed`)
                    },
                  })
                }
              >
                Remove
              </Button>
            </>
          }
        >
          <div className="flex flex-col gap-sm">
            <p className="text-body-sm text-text-secondary">
              Remove <span className="font-medium text-text-primary">{country}</span> from the shared list. Colleges,
              courses and consultancies already in {country} keep working and stay searchable — but nobody can choose
              it again, and <span className="font-medium text-text-primary">its guide is deleted with it</span>.
            </p>
            <p className="text-body-sm text-text-secondary">
              To stop offering {country} without losing the write-up, switch <em>Offered</em> off instead — that is
              reversible.
            </p>
          </div>
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
    save.mutate(
      { country, summary: summary.trim(), body_html: bodyHtml, published },
      {
        onSuccess: () => {
          onClose()
          showToast(`${country} guide saved`)
        },
      },
    )
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
          {/* Deleting the WRITE-UP lives in here, not on the row: the row already carries a
              remove-the-country control, and two destructive buttons side by side — one clearing
              a paragraph, one unlisting a destination — is a mis-click waiting to happen. */}
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
                      showToast(`${country} guide deleted`)
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

// A rank (NEET) has a best value and no worst, so an open end is real, not missing — it read as
// "1 to –" (2026-09-11).
function examRange(e: Exam) {
  if (e.min_value != null && e.max_value != null) return `${e.min_value} to ${e.max_value}`
  if (e.min_value != null) return `From ${e.min_value}`
  if (e.max_value != null) return `Up to ${e.max_value}`
  return '—'
}

function ExamsTab() {
  const exams = useExams()
  const [adding, setAdding] = useState(false)
  const [editing, setEditing] = useState<Exam | null>(null)

  const columns: TableColumn<Exam>[] = [
    {
      key: 'name',
      header: 'Exam',
      render: (e) => <span className="font-medium text-text-primary">{e.name}</span>,
    },
    {
      key: 'score_type',
      header: 'Scored as',
      render: (e) => <span className="capitalize text-text-secondary">{e.score_type}</span>,
    },
    {
      // Decides which requirement block matches this exam, and which group it appears under in
      // the student's picker. Also what makes "has an English score" a real question — it used
      // to mean "has ANY score", so a GMAT dismissed the add-an-English-test nudge.
      key: 'category',
      header: 'Type',
      render: (e) => (
        <Badge color={e.category === 'english' ? 'primary' : 'secondary'}>
          {e.category === 'english' ? 'English' : 'Aptitude'}
        </Badge>
      ),
    },
    {
      key: 'range',
      header: 'Range',
      hideBelow: 'sm',
      render: (e) => <span className="tabular-nums text-text-secondary">{examRange(e)}</span>,
    },
    {
      key: 'validity',
      header: 'Valid for',
      hideBelow: 'sm',
      render: (e) => (
        <span className="text-text-secondary">
          {e.validity_months != null ? `${e.validity_months} months` : 'No expiry'}
        </span>
      ),
    },
    {
      key: 'actions',
      header: '',
      align: 'right',
      render: (e) => <ExamRowActions exam={e} onEdit={() => setEditing(e)} />,
    },
  ]

  return (
    <div className="flex flex-col gap-md">
      <div className="flex items-start justify-between gap-md">
        <div className="flex max-w-2xl flex-col gap-xs">
          <p className="text-body-sm text-text-secondary">
            One shared list: students pick from it when adding scores to their profile, and course Entry Requirements
            reference it. Deactivating an exam hides it from new use — stored student scores are untouched.
          </p>
          <SettingsUsedIn places={['Sentpo profile test scores', 'Course entry requirements', 'Course match']} />
        </div>
        <Button size="sm" onClick={() => setAdding(true)}>
          Add Exam
        </Button>
      </div>
      <Table
        columns={columns}
        rows={exams.data ?? []}
        rowKey={(e) => e.id!}
        loading={exams.isLoading}
        error={exams.isError ? 'Could not load the exams catalog.' : undefined}
        emptyMessage="No exams yet."
      />
      {adding && <ExamFormModal onClose={() => setAdding(false)} />}
      {editing && <ExamFormModal exam={editing} onClose={() => setEditing(null)} />}
    </div>
  )
}

function ExamRowActions({ exam, onEdit }: { exam: Exam; onEdit: () => void }) {
  const updateExam = useUpdateExam(exam.id!)
  return (
    <div className="flex items-center justify-end gap-sm">
      {exam.active === false && <Badge color="secondary">Inactive</Badge>}
      <Toggle
        checked={exam.active !== false}
        onChange={(checked) => updateExam.mutate({ active: checked })}
        label={`${exam.name} active`}
      />
      <button
        type="button"
        onClick={onEdit}
        aria-label={`Edit ${exam.name}`}
        title="Edit"
        className="flex h-9 w-9 items-center justify-center rounded-md text-text-secondary hover:bg-background hover:text-text-primary"
      >
        <Pencil className="h-4 w-4" />
      </button>
    </div>
  )
}

function ExamFormModal({ exam, onClose }: { exam?: Exam; onClose: () => void }) {
  const isEditing = Boolean(exam)
  const createExam = useCreateExam()
  const updateExam = useUpdateExam(exam?.id ?? '')
  const [name, setName] = useState(exam?.name ?? '')
  const [scoreType, setScoreType] = useState(exam?.score_type ?? 'score')
  const [minValue, setMinValue] = useState(exam?.min_value != null ? String(exam.min_value) : '')
  const [maxValue, setMaxValue] = useState(exam?.max_value != null ? String(exam.max_value) : '')
  const [validityMonths, setValidityMonths] = useState(
    exam?.validity_months != null ? String(exam.validity_months) : '',
  )
  const [hasSectionBands, setHasSectionBands] = useState(exam?.has_section_bands ?? false)
  const [category, setCategory] = useState(exam?.category ?? 'aptitude')

  const mutation = isEditing ? updateExam : createExam

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!name) return
    const body = {
      name,
      score_type: scoreType,
      min_value: minValue === '' ? null : Number(minValue),
      max_value: maxValue === '' ? null : Number(maxValue),
      validity_months: validityMonths === '' ? null : Number(validityMonths),
      has_section_bands: hasSectionBands,
      category,
    }
    if (isEditing) {
      updateExam.mutate(body, {
        onSuccess: () => {
          onClose()
          showToast(`${name} updated`)
        },
      })
    } else {
      createExam.mutate(body, {
        onSuccess: () => {
          onClose()
          showToast(`${name} added`)
        },
      })
    }
  }

  return (
    <Modal
      onClose={onClose}
      title={isEditing ? 'Edit Exam' : 'Add Exam'}
      widthRem={28}
      footer={
        <>
          {mutation.isError && <p className="mr-auto self-center text-body-sm text-error">{mutation.error.message}</p>}
          <Button type="submit" form="exam-form" loading={mutation.isPending} disabled={!name}>
            {isEditing ? 'Save Changes' : 'Add Exam'}
          </Button>
        </>
      }
    >
      <form id="exam-form" onSubmit={handleSubmit} className="flex flex-col gap-md">
        <TextField
          label="Exam name"
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. CUET"
        />
        <SelectField
          label="Type"
          id="exam-category"
          value={category}
          onChange={(e) => setCategory(e.target.value as NonNullable<Exam['category']>)}
        >
          <option value="english">English test — matched by a course&apos;s English requirement</option>
          <option value="aptitude">Aptitude / entrance — matched by a course&apos;s aptitude requirement</option>
        </SelectField>
        <SelectField
          label="Scored as"
          id="exam-score-type"
          value={scoreType}
          onChange={(e) => setScoreType(e.target.value as Exam['score_type'])}
        >
          {SCORE_TYPES.map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
        </SelectField>
        <div className="grid grid-cols-2 gap-sm">
          <TextField
            label="Minimum value"
            type="number"
            value={minValue}
            onChange={(e) => setMinValue(e.target.value)}
          />
          <TextField
            label="Maximum value"
            type="number"
            value={maxValue}
            onChange={(e) => setMaxValue(e.target.value)}
          />
        </div>
        <TextField
          label="Validity (months — blank if never expires)"
          type="number"
          value={validityMonths}
          onChange={(e) => setValidityMonths(e.target.value)}
        />
        <label className="flex items-center gap-sm text-body-sm text-text-primary">
          <input
            type="checkbox"
            checked={hasSectionBands}
            onChange={(e) => setHasSectionBands(e.target.checked)}
            className="h-4 w-4"
          />
          Has per-section bands (like IELTS listening/reading/writing/speaking)
        </label>
      </form>
    </Modal>
  )
}


// A code is what every course row and every student preference stores forever, so it is derived
// from the label as you type but stays editable before you commit — rather than generated
// silently, which is how you end up with `master_s` and only find out via a filter that returns
// nothing.
function slugifyLevel(label: string) {
  return label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
}

/**
 * The education ladder — ONE list behind a student's Target study level and a course's Level.
 *
 * Both were hardcoded before this existed, and they disagreed: the course form was a free text
 * box ("e.g. masters") while the Sentpo app filtered against a title-cased four, so a course
 * saved as "MSc" or "PG" was invisible to every student who filtered by level. It lives beside
 * Exams because it is the same kind of thing — a small admin-managed list the courses module and
 * the student app both read (moved here from its own page, user 2026-09-07).
 */
function StudyLevelsTab() {
  const levels = useStudyLevels(true)
  const [adding, setAdding] = useState(false)
  const [renaming, setRenaming] = useState<StudyLevel | null>(null)
  const rows = levels.data ?? []

  const columns: TableColumn<StudyLevel>[] = [
    {
      key: 'label',
      header: 'Label',
      render: (row) => (
        <span className={row.active === false ? 'text-text-secondary line-through' : 'font-medium text-text-primary'}>
          {row.label}
        </span>
      ),
    },
    {
      key: 'code',
      header: 'Code (stored)',
      hideBelow: 'sm',
      render: (row) => <span className="font-mono text-caption text-text-secondary">{row.code}</span>,
    },
    { key: 'order', header: 'Order', render: (row) => <ReorderLevelCell level={row} rows={rows} /> },
    {
      // Shown because retiring a rung is refused while courses still sit on it — an admin should
      // see what holds a rung BEFORE they hit that refusal, not after.
      key: 'courses',
      header: 'Courses',
      align: 'right',
      render: (row) => <span className="tabular-nums text-text-secondary">{row.course_count ?? 0}</span>,
    },
    {
      key: 'actions',
      header: '',
      align: 'right',
      render: (row) => <StudyLevelRowActions level={row} onRename={() => setRenaming(row)} />,
    },
  ]

  return (
    <div className="flex flex-col gap-md">
      <div className="flex items-start justify-between gap-md">
        <div className="flex max-w-2xl flex-col gap-xs">
          <p className="text-body-sm text-text-secondary">
            One ladder, read in two places: the level a course teaches at, and the level a student says they are
            aiming for. Search matches one against the other, so they have to be the same list — a rung added here
            appears in the course form and in the Sentpo app&apos;s Target study level picker with no app release.
          </p>
          <SettingsUsedIn
            places={['Course level', 'Sentpo target study level', 'Search level filter', 'Ad targeting']}
          />
        </div>
        <Button size="sm" onClick={() => setAdding(true)}>
          Add Study Level
        </Button>
      </div>
      <Table
        columns={columns}
        rows={rows}
        rowKey={(row) => row.code}
        loading={levels.isLoading}
        error={levels.isError ? 'Could not load the study levels ladder.' : undefined}
        emptyMessage="No study levels yet."
      />
      {adding && <StudyLevelFormModal onClose={() => setAdding(false)} />}
      {renaming && <StudyLevelFormModal level={renaming} onClose={() => setRenaming(null)} />}
    </div>
  )
}

// Order is a ladder, not an alphabet, so it moves a step at a time rather than being typed:
// swapping two neighbours' sort_order is the only reorder that cannot produce a gap or a tie.
function ReorderLevelCell({ level, rows }: { level: StudyLevel; rows: StudyLevel[] }) {
  const update = useUpdateStudyLevel()
  const index = rows.findIndex((r) => r.code === level.code)

  function swapWith(other: StudyLevel | undefined) {
    if (!other) return
    const mine = level.sort_order ?? 0
    update.mutate({ code: level.code, sort_order: other.sort_order ?? 0 })
    update.mutate({ code: other.code, sort_order: mine })
  }

  return (
    <div className="flex items-center gap-xs">
      <button
        type="button"
        onClick={() => swapWith(rows[index - 1])}
        disabled={index <= 0 || update.isPending}
        aria-label={`Move ${level.label} up`}
        title="Move up"
        className="flex h-8 w-8 items-center justify-center rounded-md text-text-secondary hover:bg-background hover:text-text-primary disabled:opacity-30"
      >
        <ChevronUp className="h-4 w-4" />
      </button>
      <button
        type="button"
        onClick={() => swapWith(rows[index + 1])}
        disabled={index < 0 || index >= rows.length - 1 || update.isPending}
        aria-label={`Move ${level.label} down`}
        title="Move down"
        className="flex h-8 w-8 items-center justify-center rounded-md text-text-secondary hover:bg-background hover:text-text-primary disabled:opacity-30"
      >
        <ChevronDown className="h-4 w-4" />
      </button>
      <span className="tabular-nums text-caption text-text-secondary">{level.sort_order ?? '—'}</span>
    </div>
  )
}

// Delete shows only on a rung no visible course uses (2026-09-11) — it exists for a rung added by
// mistake. The server also checks hidden courses, students and ads, and its refusal names them.
function StudyLevelRowActions({ level, onRename }: { level: StudyLevel; onRename: () => void }) {
  const update = useUpdateStudyLevel()
  const remove = useDeleteStudyLevel()
  const [confirming, setConfirming] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const retired = level.active === false
  const deletable = (level.course_count ?? 0) === 0

  return (
    <div className="flex items-center justify-end gap-sm">
      {retired && <Badge color="secondary">Retired</Badge>}
      <button
        type="button"
        onClick={onRename}
        aria-label={`Rename ${level.label}`}
        title="Rename"
        className="flex h-9 w-9 items-center justify-center rounded-md text-text-secondary hover:bg-background hover:text-text-primary"
      >
        <Pencil className="h-4 w-4" />
      </button>
      <button
        type="button"
        onClick={() => (retired ? update.mutate({ code: level.code, active: true }) : setConfirming(true))}
        disabled={update.isPending}
        aria-label={retired ? `Restore ${level.label}` : `Retire ${level.label}`}
        title={retired ? 'Restore' : 'Retire'}
        className="flex h-9 w-9 items-center justify-center rounded-md text-text-secondary hover:bg-background hover:text-text-primary disabled:opacity-40"
      >
        {retired ? <ArchiveRestore className="h-4 w-4" /> : <Archive className="h-4 w-4" />}
      </button>
      {deletable && (
        <button
          type="button"
          onClick={() => setDeleting(true)}
          aria-label={`Delete ${level.label}`}
          title="Delete"
          className="flex h-9 w-9 items-center justify-center rounded-md text-text-secondary hover:bg-background hover:text-error"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      )}
      {deleting && (
        <Modal
          onClose={() => setDeleting(false)}
          title="Delete study level"
          widthRem={26}
          footer={
            <>
              {remove.isError && <p className="mr-auto self-center text-body-sm text-error">{remove.error.message}</p>}
              <Button variant="secondary" onClick={() => setDeleting(false)}>
                Cancel
              </Button>
              <Button
                variant="destructive"
                loading={remove.isPending}
                onClick={() =>
                  remove.mutate(level.code, {
                    onSuccess: () => {
                      setDeleting(false)
                      showToast(`${level.label} deleted`)
                    },
                  })
                }
              >
                Delete
              </Button>
            </>
          }
        >
          <p className="text-body-sm text-text-secondary">
            Remove <span className="font-medium text-text-primary">{level.label}</span> from the ladder for good. This
            is for a rung added by mistake — it is refused if any course, student or ad still uses it, and then
            retiring is the way to stop offering it.
          </p>
        </Modal>
      )}
      {confirming && (
        <Modal
          onClose={() => setConfirming(false)}
          title="Retire study level"
          widthRem={26}
          footer={
            <>
              {update.isError && (
                <p className="mr-auto self-center text-body-sm text-error">{update.error.message}</p>
              )}
              <Button variant="secondary" onClick={() => setConfirming(false)}>
                Cancel
              </Button>
              <Button
                variant="destructive"
                loading={update.isPending}
                onClick={() =>
                  update.mutate(
                    { code: level.code, active: false },
                    {
                      onSuccess: () => {
                        setConfirming(false)
                        showToast(`${level.label} retired`)
                      },
                    },
                  )
                }
              >
                Retire
              </Button>
            </>
          }
        >
          <p className="text-body-sm text-text-secondary">
            Stop offering <span className="font-medium text-text-primary">{level.label}</span> in course forms and in
            the Sentpo app&apos;s pickers. It stays in the table, so courses and students already on it keep reading
            correctly — and it can be restored here at any time.
          </p>
        </Modal>
      )}
    </div>
  )
}

function StudyLevelFormModal({ level, onClose }: { level?: StudyLevel; onClose: () => void }) {
  const isEditing = Boolean(level)
  const createLevel = useCreateStudyLevel()
  const updateLevel = useUpdateStudyLevel()
  const [label, setLabel] = useState(level?.label ?? '')
  const [code, setCode] = useState('')
  const [codeEdited, setCodeEdited] = useState(false)
  const mutation = isEditing ? updateLevel : createLevel
  // Follows the label until an admin takes it over, and is frozen entirely when editing: the code
  // is what every course and every student preference already stores.
  const effectiveCode = isEditing ? level!.code : codeEdited ? code : slugifyLevel(label)

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!label.trim() || !effectiveCode) return
    const trimmedLabel = label.trim()
    if (isEditing) {
      updateLevel.mutate(
        { code: level!.code, label: trimmedLabel },
        {
          onSuccess: () => {
            onClose()
            showToast(`${trimmedLabel} renamed`)
          },
        },
      )
    } else {
      createLevel.mutate(
        { label: trimmedLabel, code: effectiveCode },
        {
          onSuccess: () => {
            onClose()
            showToast(`${trimmedLabel} added`)
          },
        },
      )
    }
  }

  return (
    <Modal
      onClose={onClose}
      title={isEditing ? 'Rename Study Level' : 'Add Study Level'}
      widthRem={28}
      footer={
        <>
          {mutation.isError && <p className="mr-auto self-center text-body-sm text-error">{mutation.error.message}</p>}
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="submit"
            form="study-level-form"
            loading={mutation.isPending}
            disabled={!label.trim() || !effectiveCode || (isEditing && label.trim() === level!.label)}
          >
            {isEditing ? 'Save Changes' : 'Add Study Level'}
          </Button>
        </>
      }
    >
      <form id="study-level-form" onSubmit={handleSubmit} className="flex flex-col gap-md">
        <TextField label="Label" required value={label} onChange={(e) => setLabel(e.target.value)} />
        <TextField
          label="Code (stored)"
          value={effectiveCode}
          disabled={isEditing}
          onChange={(e) => {
            setCodeEdited(true)
            setCode(e.target.value)
          }}
        />
        <p className="text-caption text-text-secondary">
          {isEditing
            ? 'Wording only. The code stays as it is — courses and student preferences already store it, and changing it would orphan every one of them without an error anywhere.'
            : 'Filled in from the label; edit it if you want something different. New rungs go to the end of the ladder — move them into place with the arrows. The code can never be changed afterwards.'}
        </p>
      </form>
    </Modal>
  )
}

// Rates are set by hand with no feed, so an old one quietly skews every "≈" amount and every
// cross-currency fee filter. Past this age a rate is flagged for a check (2026-09-11).
const STALE_RATE_DAYS = 30

function daysSince(iso: string | null | undefined) {
  if (!iso) return null
  return Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000))
}

function agoLabel(days: number) {
  return days === 0 ? 'today' : days === 1 ? '1 day ago' : `${days} days ago`
}

type MissingRate = components['schemas']['MissingExchangeRate']

// "2 students · 1 consultancy · Japan" — who is going without an "≈" today, most affected first.
function missingRateReach(m: MissingRate) {
  const parts: string[] = []
  if (m.student_count) parts.push(`${m.student_count} student${m.student_count === 1 ? '' : 's'}`)
  if (m.consultancy_count) parts.push(`${m.consultancy_count} consultanc${m.consultancy_count === 1 ? 'y' : 'ies'}`)
  const names = m.countries.slice(0, 3).join(', ')
  if (names) parts.push(m.countries.length > 3 ? `${names} +${m.countries.length - 3} more` : names)
  return parts.join(' · ')
}

function ExchangeRatesTab() {
  const rates = useExchangeRates()
  const missing = useMissingExchangeRates()
  const [editing, setEditing] = useState<ExchangeRate | null>(null)
  // null = closed; '' = a blank Add Currency; a code = "Add rate" from the missing list.
  const [adding, setAdding] = useState<string | null>(null)
  const [showAllMissing, setShowAllMissing] = useState(false)
  const missingRows = missing.data ?? []
  const shownMissing = showAllMissing ? missingRows : missingRows.slice(0, 5)
  const staleCount = (rates.data ?? []).filter((r) => (daysSince(r.updated_at) ?? 0) > STALE_RATE_DAYS).length

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
        const days = daysSince(r.updated_at)
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
    {
      key: 'actions',
      header: '',
      align: 'right',
      render: (r) => (
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
        <Button size="sm" onClick={() => setAdding('')}>
          Add Currency
        </Button>
      </div>
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
                  <Button size="sm" variant="secondary" onClick={() => setAdding(m.currency)}>
                    Add rate
                  </Button>
                </li>
              ))}
            </ul>
          </div>
        </Card>
      )}
      <Table
        columns={columns}
        rows={rates.data ?? []}
        rowKey={(r) => r.currency}
        loading={rates.isLoading}
        error={rates.isError ? 'Could not load exchange rates.' : undefined}
        emptyMessage="No rates yet."
      />
      {(editing || adding !== null) && (
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
  const [currency, setCurrency] = useState(rate?.currency ?? presetCurrency ?? '')
  const [inrPerUnit, setInrPerUnit] = useState(rate ? String(rate.inr_per_unit) : '')
  const valid = currency.trim().length === 3 && Number(inrPerUnit) > 0

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!valid) return
    const code = currency.trim().toUpperCase()
    upsert.mutate(
      { currency: code, inr_per_unit: Number(inrPerUnit) },
      {
        onSuccess: () => {
          onClose()
          showToast(rate ? `${code} rate updated` : `${code} rate added`)
        },
      },
    )
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
    </Modal>
  )
}

/**
 * Course Popularity — whether Sentpo users see how many students have viewed each course.
 *
 * Views are ALWAYS counted; this switch governs only whether students see them. Pausing
 * collection instead would leave the numbers wrong for as long as it stayed off, and leave
 * whoever turns it back on with no data to decide with. Platform staff keep seeing the counts
 * either way, since they are what the decision is about.
 */
function CoursePopularityTab() {
  const settings = usePlatformSettings()
  const update = useUpdatePlatformSettings()
  const enabled = settings.data?.show_course_view_counts ?? false

  return (
    <Card>
      <div className="flex items-start justify-between gap-lg">
        <div className="flex flex-col gap-xs">
          <p className="text-body font-medium text-text-primary">Show view counts to Sentpo users</p>
          <p className="text-body-sm text-text-secondary">
            Students see how many people have viewed each course, and the most-viewed courses within whatever filter
            they are searching carry a &ldquo;Most viewed&rdquo; tag &mdash; the top 3 once a search matches 10 or more
            courses, the top 5 at 25 or more. Below 10 matches nothing is tagged, since marking 3 of 4 results says
            nothing.
          </p>
          <p className="text-body-sm text-text-secondary">
            Turning this off hides the numbers from students only. Views keep being counted, so the figures stay correct
            and you can turn it back on without a gap. You will still see them here and in Colleges &amp; Courses.
          </p>
          <SettingsUsedIn places={['Sentpo course cards', 'Search “Most viewed” tag']} />
        </div>
        <Toggle
          label="Show course view counts to Sentpo users"
          checked={enabled}
          disabled={settings.isLoading || update.isPending}
          onChange={(next) => update.mutate({ show_course_view_counts: next })}
        />
      </div>
    </Card>
  )
}
