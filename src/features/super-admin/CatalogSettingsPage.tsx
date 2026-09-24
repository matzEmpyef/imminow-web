import { useMemo, useState, type FormEvent } from 'react'
import { Archive, ArchiveRestore, ChevronDown, ChevronUp, MapPin, Pencil, Trash2 } from 'lucide-react'
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
import { Skeleton } from '@/components/QueryState'
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
  useManagedStates,
  useAddState,
  useUpdateState,
} from '@/queries/countries'
import {
  useCountryContent,
  useDeleteCountryContent,
  useSaveCountryContent,
  type CountryContent,
} from '@/queries/countryContent'
import { daysSince, formatDate } from '@/lib/time'
import { showToast } from '@/lib/toast'
import { ApiError } from '@/api/errors'
import { useAuthStore } from '@/stores/authStore'
import type { components } from '@/api/schema'
import type { StudyLevel } from '@/lib/studyLevels'

type Exam = components['schemas']['Exam']
type ExchangeRate = components['schemas']['ExchangeRate']
type CountrySetting = components['schemas']['CountrySetting']
type StateProvince = components['schemas']['StateProvince']
type StateProvinceChange = components['schemas']['StateProvinceChange']

const TABS = [
  'Countries',
  'Exams',
  'Study Levels',
  'Fields of Study',
  'Exchange Rates',
  'Score Schemes',
  'Course Popularity',
] as const

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
        ) : activeTab === 'Score Schemes' ? (
          <ScoreSchemeConversionsTab />
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
  const [managingStates, setManagingStates] = useState<string | null>(null)

  // Every country gets a row whether or not anyone has written about it — listing only the
  // written ones would hide the gap the guide half of this tab exists to close.
  //
  // `hasRate` is THREE-valued (assumptions audit M36, product owner 2026-09-19). It used to be
  // "assumed true until the rates load", so while the query was in flight every row claimed a
  // rate it had not checked and the Data gaps card read "No rate: 0" — an admin who looked at
  // the right moment was told the gap did not exist. `null` means nobody has looked yet, and the
  // cell shows a skeleton instead of an answer.
  const rows = useMemo(() => {
    const byCountry = new Map((content.data ?? []).map((c) => [c.country, c]))
    const rated = rates.data ? new Set(rates.data.map((r) => r.currency)) : null
    return (countries.data ?? []).map((country) => ({
      ...country,
      guide: byCountry.get(country.name),
      hasRate: rated ? rated.has(country.default_currency) : null,
      waitsReviewed: country.offer_turnaround_days_reviewed !== false && country.expected_close_days_reviewed !== false,
    }))
  }, [countries.data, content.data, rates.data])
  // Nothing may be counted or filtered on a rate check that has not happened (M36).
  const ratesKnown = rates.data != null

  const needle = search.trim().toLowerCase()
  const visible = rows.filter((c) => {
    if (needle && !c.name.toLowerCase().includes(needle) && !(c.iso2 ?? '').toLowerCase().includes(needle)) return false
    if (offeredFilter === 'offered' && c.active === false) return false
    if (offeredFilter === 'not_offered' && c.active !== false) return false
    if (guideFilter === 'published' && !c.guide?.published) return false
    if (guideFilter === 'draft' && (!c.guide || c.guide.published)) return false
    if (guideFilter === 'none' && c.guide) return false
    if (noRateOnly && c.hasRate !== false) return false
    if (unreviewedOnly && c.waitsReviewed) return false
    return true
  })
  const offered = rows.filter((r) => r.active !== false).length
  const published = rows.filter((r) => r.guide?.published).length
  const noRate = rows.filter((r) => r.hasRate === false).length
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
            onClick={() => setManagingStates(row.name)}
            aria-label={`Manage states for ${row.name}`}
            title="States & provinces"
            className="flex h-9 w-9 items-center justify-center rounded-md text-text-secondary hover:bg-background hover:text-text-primary"
          >
            <MapPin className="h-4 w-4" />
          </button>
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
      {/* A visible checklist, not just the quick-filter chips below (product review, 2026-09-12) —
          both gaps used to be findable only by an admin who already knew the chip existed. */}
      {((ratesKnown && noRate > 0) || unreviewed > 0) && (
        <Card>
          <div className="flex flex-col gap-sm">
            <p className="text-body font-medium text-text-primary">Data gaps</p>
            <ul className="flex flex-col divide-y divide-border">
              {ratesKnown && noRate > 0 && (
                <li className="flex items-center justify-between gap-md py-sm">
                  <span className="text-body-sm text-text-primary">
                    {noRate} {noRate === 1 ? 'currency' : 'currencies'} still need{noRate === 1 ? 's' : ''} a rate
                  </span>
                  <Button size="sm" variant="secondary" onClick={() => setNoRateOnly(true)}>
                    Show only these
                  </Button>
                </li>
              )}
              {unreviewed > 0 && (
                <li className="flex items-center justify-between gap-md py-sm">
                  <span className="text-body-sm text-text-primary">
                    {unreviewed} {unreviewed === 1 ? 'country' : 'countries'} on default waits
                  </span>
                  <Button size="sm" variant="secondary" onClick={() => setUnreviewedOnly(true)}>
                    Show only these
                  </Button>
                </li>
              )}
            </ul>
          </div>
        </Card>
      )}
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
            {/* No count until there is one to give (M36) — "(0)" was a claim, not a blank. */}
            <FilterChip
              label={ratesKnown ? `No exchange rate (${noRate})` : 'No exchange rate'}
              active={noRateOnly}
              onChange={setNoRateOnly}
            />
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
      {managingStates && <StatesModal country={managingStates} onClose={() => setManagingStates(null)} />}
    </div>
  )
}

// Same gate the route already requires to reach this page at all — PlatformRoute redirects anyone
// without `catalog_settings` away from /admin/settings before CatalogSettingsPage ever mounts. Kept
// as an explicit check anyway (same pattern as SupplyDemandPage's CapacityAssumption) so the write
// controls in the States modal stay correctly gated even if that route guard is ever loosened to
// `anyPermission` for read access.
function useCanManageCatalogSettings() {
  return useAuthStore(
    (s) =>
      s.user?.role === 'super_admin' ||
      Boolean((s.user?.platform_permissions as Record<string, boolean> | undefined)?.catalog_settings),
  )
}

/**
 * States & provinces (2026-09-15) — one country's list, opened from its row rather than a seventh
 * Countries column: a list of up to a few hundred names doesn't fit a table cell. It is the list
 * every state picker reads (student profiles, campuses, institutions, partner locations, targeting)
 * and every state write is checked against, so a rename here is carried into all of those records
 * server-side — this is the one place that keeps them in sync.
 */
function StatesModal({ country, onClose }: { country: string; onClose: () => void }) {
  const canEdit = useCanManageCatalogSettings()
  const states = useManagedStates(country)
  const [search, setSearch] = useState('')
  const [adding, setAdding] = useState(false)
  const [renaming, setRenaming] = useState<StateProvince | null>(null)
  const rows = states.data ?? []

  const needle = search.trim().toLowerCase()
  const visible = needle ? rows.filter((s) => s.name.toLowerCase().includes(needle)) : rows

  const columns: TableColumn<StateProvince>[] = [
    {
      key: 'name',
      header: 'Name',
      render: (s) => (
        <span className={s.active ? 'font-medium text-text-primary' : 'text-text-secondary'}>{s.name}</span>
      ),
    },
    { key: 'type', header: 'Type', render: (s) => <span className="text-text-secondary">{s.type}</span> },
    {
      // Null means an admin typed it in here rather than it coming off the ISO 3166-2 seed list —
      // worth saying plainly rather than leaving the cell blank, which would read as missing data.
      key: 'code',
      header: 'ISO code',
      render: (s) =>
        s.code ? (
          <span className="font-mono text-caption text-text-secondary">{s.code}</span>
        ) : (
          <span className="text-caption text-text-secondary">Added in immiNow</span>
        ),
    },
    {
      key: 'active',
      header: 'Active',
      render: (s) => <StateActiveToggle country={country} state={s} canEdit={canEdit} />,
    },
    {
      key: 'actions',
      header: '',
      align: 'right',
      render: (s) =>
        canEdit ? (
          <button
            type="button"
            onClick={() => setRenaming(s)}
            aria-label={`Rename ${s.name}`}
            title="Rename"
            className="flex h-9 w-9 items-center justify-center rounded-md text-text-secondary hover:bg-background hover:text-text-primary"
          >
            <Pencil className="h-4 w-4" />
          </button>
        ) : null,
    },
  ]

  return (
    <Modal onClose={onClose} title={`${country} — States & provinces`} widthRem={40} dismissible>
      <div className="flex flex-col gap-md">
        <div className="flex items-start justify-between gap-md">
          {/* flex-1, not max-w-md: in this project max-w-md resolves to the 16px spacing token (see
              scripts/check-max-w.mjs), which squeezed this note into a one-word column (2026-09-15). */}
          <p className="min-w-0 flex-1 text-body-sm text-text-secondary">
            Read by every state picker platform-wide and by the state field on student profiles, campuses,
            institutions and partner locations. Switching one off only hides it from new picks — records already
            using it keep working.
          </p>
          {canEdit && (
            <div className="shrink-0">
              <Button size="sm" onClick={() => setAdding(true)}>
                Add state
              </Button>
            </div>
          )}
        </div>
        <Table
          bare
          columns={columns}
          rows={visible}
          rowKey={(s) => s.name}
          loading={states.isLoading}
          error={states.isError ? 'Could not load states.' : undefined}
          emptyMessage={
            rows.length === 0 ? `No states or provinces for ${country}. Add one if the country has them.` : 'No states match.'
          }
          search={{ value: search, onChange: setSearch, placeholder: 'Search states…' }}
        />
      </div>
      {adding && <AddStateModal country={country} onClose={() => setAdding(false)} />}
      {renaming && <RenameStateModal country={country} state={renaming} onClose={() => setRenaming(null)} />}
    </Modal>
  )
}

// On / off, same shape as CountryActiveToggle above — but switching a state off has no `in_use`
// refusal to catch (the contract is explicit: existing records keep it, always), so this only ever
// needs the one confirm step before the plain PATCH.
function StateActiveToggle({
  country,
  state,
  canEdit,
}: {
  country: string
  state: StateProvince
  canEdit: boolean
}) {
  const update = useUpdateState(country)
  const [confirming, setConfirming] = useState(false)

  return (
    <div className="flex items-center gap-xs">
      <Toggle
        size="sm"
        checked={state.active}
        disabled={!canEdit || update.isPending}
        onChange={(checked) =>
          checked ? update.mutate({ state: state.name, active: true }) : setConfirming(true)
        }
        label={`${state.name} active`}
      />
      {update.isError && !confirming && <span className="text-caption text-error">Not saved</span>}
      {confirming && (
        <Modal
          onClose={() => setConfirming(false)}
          title={`Switch off ${state.name}?`}
          footer={
            <>
              <Button variant="secondary" onClick={() => setConfirming(false)} disabled={update.isPending}>
                Cancel
              </Button>
              <Button
                variant="destructive"
                loading={update.isPending}
                onClick={() =>
                  update.mutate(
                    { state: state.name, active: false },
                    { onSuccess: () => setConfirming(false) },
                  )
                }
              >
                Switch off
              </Button>
            </>
          }
        >
          <p className="text-body-sm text-text-primary">
            Hide {state.name} from every state picker? Records already using it keep it.
          </p>
        </Modal>
      )}
    </div>
  )
}

function AddStateModal({ country, onClose }: { country: string; onClose: () => void }) {
  const addState = useAddState(country)
  const [name, setName] = useState('')
  const [type, setType] = useState('State')

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    const trimmedName = name.trim()
    if (!trimmedName) return
    addState.mutate(
      { name: trimmedName, type: type.trim() || undefined },
      {
        onSuccess: () => {
          onClose()
          showToast(`${trimmedName} added to ${country}`)
        },
      },
    )
  }

  return (
    <Modal
      onClose={onClose}
      title={`Add state to ${country}`}
      widthRem={26}
      footer={
        <>
          {addState.isError && <p className="mr-auto self-center text-body-sm text-error">{addState.error.message}</p>}
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="add-state-form" loading={addState.isPending} disabled={!name.trim()}>
            Add state
          </Button>
        </>
      }
    >
      <form id="add-state-form" onSubmit={handleSubmit} className="flex flex-col gap-md">
        <TextField label="Name" required value={name} onChange={(e) => setName(e.target.value)} />
        <TextField
          label="Type"
          value={type}
          onChange={(e) => setType(e.target.value)}
          placeholder="State, Province, Region…"
        />
      </form>
    </Modal>
  )
}

// Name only, per the contract's note that a rename fans out into every student profile, campus,
// institution, partner location and saved audience holding the old value — worth saying before the
// save, not just after in the toast.
function RenameStateModal({
  country,
  state,
  onClose,
}: {
  country: string
  state: StateProvince
  onClose: () => void
}) {
  const update = useUpdateState(country)
  const [name, setName] = useState(state.name)
  const trimmed = name.trim()
  const unchanged = trimmed === state.name

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!trimmed || unchanged) return
    update.mutate(
      { state: state.name, name: trimmed },
      {
        onSuccess: (data) => {
          onClose()
          showToast(renameStateToast(state.name, trimmed, data.records_updated))
        },
      },
    )
  }

  return (
    <Modal
      onClose={onClose}
      title={`Rename ${state.name}`}
      widthRem={26}
      footer={
        <>
          {update.isError && <p className="mr-auto self-center text-body-sm text-error">{update.error.message}</p>}
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="rename-state-form" loading={update.isPending} disabled={!trimmed || unchanged}>
            Save
          </Button>
        </>
      }
    >
      <form id="rename-state-form" onSubmit={handleSubmit} className="flex flex-col gap-md">
        <TextField label="Name" required value={name} onChange={(e) => setName(e.target.value)} />
        <p className="text-caption text-text-secondary">
          Renaming updates every student profile, campus, institution, partner location and saved audience that uses
          this name.
        </p>
      </form>
    </Modal>
  )
}

// "Renamed Kerala to Keralam — updated 7 students, 22 institutions, 1 audience" — zero-count parts
// are dropped rather than listed (unlike the CountrySetting waits table, there's no fixed shape
// here worth keeping columns aligned for), falling back to a plain "no records used this name yet"
// when the rename touched nothing.
function renameStateToast(oldName: string, newName: string, records: StateProvinceChange['records_updated']) {
  const parts: string[] = []
  if (records.students) parts.push(`${records.students} student${records.students === 1 ? '' : 's'}`)
  if (records.institutions) parts.push(`${records.institutions} institution${records.institutions === 1 ? '' : 's'}`)
  if (records.campuses) parts.push(`${records.campuses} campus${records.campuses === 1 ? '' : 'es'}`)
  if (records.partner_locations) {
    parts.push(`${records.partner_locations} partner location${records.partner_locations === 1 ? '' : 's'}`)
  }
  if (records.audiences) parts.push(`${records.audiences} audience${records.audiences === 1 ? '' : 's'}`)
  const summary = parts.length > 0 ? `updated ${parts.join(', ')}` : 'no records used this name yet'
  return `Renamed ${oldName} to ${newName} — ${summary}`
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
  // Switching off a country with existing campuses is refused 409 `in_use` — its
  // `details.college_names` names who is affected (review C6, 2026-09-12). Held here rather than
  // read straight off setActive.error so the confirmation modal survives the mutation resetting
  // between the first (refused) attempt and the confirmed retry.
  const [pendingInUse, setPendingInUse] = useState<{ college_names?: string[] } | null>(null)

  function trySwitchOff() {
    setActive.mutate(
      { name: row.name, active: false },
      {
        onError: (error) => {
          if (error instanceof ApiError && error.code === 'in_use') {
            setPendingInUse((error.details as { college_names?: string[] } | undefined) ?? {})
          }
        },
      },
    )
  }

  return (
    <StopPropagation className="flex items-center gap-xs">
      <Toggle
        size="sm"
        checked={row.active !== false}
        onChange={(checked) => (checked ? setActive.mutate({ name: row.name, active: true }) : trySwitchOff())}
        label={`Offer ${row.name}`}
      />
      {setActive.isError && !pendingInUse && <span className="text-caption text-error">Not saved</span>}
      {pendingInUse && (
        <Modal
          onClose={() => setPendingInUse(null)}
          title={`Switch off ${row.name}?`}
          footer={
            <>
              <Button variant="secondary" onClick={() => setPendingInUse(null)} disabled={setActive.isPending}>
                Cancel
              </Button>
              <Button
                variant="destructive"
                loading={setActive.isPending}
                onClick={() =>
                  setActive.mutate(
                    { name: row.name, active: false, confirm: true },
                    { onSuccess: () => setPendingInUse(null) },
                  )
                }
              >
                Switch off anyway
              </Button>
            </>
          }
        >
          <div className="flex flex-col gap-sm">
            <p className="text-body-sm text-text-primary">
              {(pendingInUse.college_names?.length ?? 0)} college{pendingInUse.college_names?.length === 1 ? '' : 's'}{' '}
              have campuses there
              {pendingInUse.college_names?.length ? <>: {pendingInUse.college_names.join(', ')}</> : null}.
            </p>
            <p className="text-body-sm text-text-secondary">
              Their records keep the country; nobody can pick it for anything new.
            </p>
          </div>
        </Modal>
      )}
    </StopPropagation>
  )
}

// One row's currency control. Saves on change — a per-row "Save" button for a single select is
// more chrome than the decision deserves.
//
// "No rate" (2026-09-11): 91 of 119 countries were seeded with a currency the rate table does not
// hold, so a student living in one gets no "≈" amount anywhere. Exchange Rates lists them too,
// ranked by who they affect; this chip is the same fact at the row it applies to.
function DefaultCurrencyCell({ row, hasRate }: { row: CountrySetting; hasRate: boolean | null }) {
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
      {/* A skeleton while the rate table is still loading, never an optimistic "has a rate"
          (assumptions audit M36, product owner 2026-09-19). */}
      {hasRate === null && <Skeleton className="h-5 w-16 rounded-full" />}
      {hasRate === false && (
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
  const staleCount = (rates.data ?? []).filter((r) => (rateAgeDays(r.updated_at) ?? 0) > STALE_RATE_DAYS).length

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
 * Score scheme conversions (assumptions audit C3, approved 2026-09-19) — how a CGPA becomes the
 * percentage every eligibility check compares against.
 *
 * ×9.5 for a 10-point CGPA is CBSE's formula and it was applied to every student in the country.
 * Anna University publishes (CGPA − 0.5) × 10 and VTU (CGPA − 0.75) × 10, so a VTU student's 8.5
 * was read as 80.75 % when their own university calls it 77.5 %. Putting the two numbers on a
 * settings page is the difference between a rule somebody chose and a constant nobody did.
 *
 * Both schemes save in one PATCH, because they are one decision about how scores are read, and
 * saving half of it would leave the pair inconsistent with no way to tell from the screen.
 */
type ScoreScheme = 'cgpa_10' | 'cgpa_4'

const SCORE_SCHEME_DEFAULTS: Record<ScoreScheme, { label: string; hint: string; multiplier: number; offset: number }> = {
  cgpa_10: {
    label: 'CGPA (out of 10)',
    hint: 'CBSE publishes ×9.5. Anna University is (CGPA − 0.5) × 10, VTU (CGPA − 0.75) × 10.',
    multiplier: 9.5,
    offset: 0,
  },
  cgpa_4: { label: 'GPA (out of 4)', hint: 'The common rule of thumb is ×25.', multiplier: 25, offset: 0 },
}

function ScoreSchemeConversionsTab() {
  const settings = usePlatformSettings()
  const update = useUpdatePlatformSettings()
  const saved = settings.data?.score_scheme_conversions
  // Keyed by scheme so one draft object covers both rows; seeded from the saved setting, or from
  // the documented defaults when nothing has been set yet, so the admin always sees the numbers
  // currently in force rather than empty boxes.
  const [draft, setDraft] = useState<Record<ScoreScheme, { multiplier: string; offset: string }> | null>(null)
  const current =
    draft ??
    (Object.fromEntries(
      (Object.keys(SCORE_SCHEME_DEFAULTS) as ScoreScheme[]).map((scheme) => [
        scheme,
        {
          multiplier: String(saved?.[scheme]?.multiplier ?? SCORE_SCHEME_DEFAULTS[scheme].multiplier),
          offset: String(saved?.[scheme]?.offset ?? SCORE_SCHEME_DEFAULTS[scheme].offset),
        },
      ]),
    ) as Record<ScoreScheme, { multiplier: string; offset: string }>)

  const parsed = (Object.keys(SCORE_SCHEME_DEFAULTS) as ScoreScheme[]).map((scheme) => ({
    scheme,
    multiplier: Number(current[scheme].multiplier),
    offset: Number(current[scheme].offset),
  }))
  // Same bounds the server checks: a multiplier above 0, an offset of 0 or more.
  const invalid = parsed.some(
    (r) => !Number.isFinite(r.multiplier) || r.multiplier <= 0 || !Number.isFinite(r.offset) || r.offset < 0,
  )

  function setField(scheme: ScoreScheme, field: 'multiplier' | 'offset', value: string) {
    setDraft({ ...current, [scheme]: { ...current[scheme], [field]: value } })
  }

  return (
    <Card className="flex flex-col gap-md">
      <div className="flex flex-col gap-xs">
        <h2 className="text-h3 text-text-primary">Score scheme conversions</h2>
        <p className="text-body-sm text-text-secondary">
          A student enters a score and says what it is out of. To check it against a course&rsquo;s minimum, Sentpo
          converts it to a percentage with this formula:
        </p>
        <p className="rounded-md bg-background px-md py-sm text-body-sm text-text-primary">
          percentage = (score &minus; offset) &times; multiplier
        </p>
        <p className="text-body-sm text-text-secondary">
          A score a university already states as a percentage is stored as it is and never converted.
        </p>
      </div>

      <div className="flex flex-col gap-md">
        {(Object.keys(SCORE_SCHEME_DEFAULTS) as ScoreScheme[]).map((scheme) => {
          const meta = SCORE_SCHEME_DEFAULTS[scheme]
          const row = current[scheme]
          const preview = Number(row.multiplier) > 0 ? ((scheme === 'cgpa_10' ? 8.5 : 3.4) - Number(row.offset || 0)) * Number(row.multiplier) : null
          return (
            <div key={scheme} className="flex flex-col gap-xs rounded-md border border-border p-md">
              <p className="text-body-sm font-medium text-text-primary">{meta.label}</p>
              <div className="grid grid-cols-1 gap-md sm:grid-cols-2">
                <TextField
                  label="Multiplier"
                  type="number"
                  step="any"
                  min="0"
                  value={row.multiplier}
                  onChange={(e) => setField(scheme, 'multiplier', e.target.value)}
                />
                <TextField
                  label="Offset"
                  type="number"
                  step="any"
                  min="0"
                  value={row.offset}
                  onChange={(e) => setField(scheme, 'offset', e.target.value)}
                />
              </div>
              <p className="text-caption text-text-secondary">{meta.hint}</p>
              {preview != null && (
                <p className="text-caption text-text-secondary">
                  {scheme === 'cgpa_10' ? '8.5' : '3.4'} reads as {preview.toFixed(1)}%.
                </p>
              )}
            </div>
          )
        })}
      </div>

      <SettingsUsedIn places={['Course entry requirements', 'Eligibility badges', 'Sentpo profile scores']} />

      <div className="flex items-center justify-end gap-md border-t border-border pt-md">
        {update.isError && <p className="text-body-sm text-error">{update.error.message}</p>}
        {invalid && <p className="text-body-sm text-error">A multiplier must be above 0 and an offset 0 or more.</p>}
        <Button
          loading={update.isPending}
          disabled={invalid || settings.isLoading}
          onClick={() =>
            update.mutate(
              {
                score_scheme_conversions: Object.fromEntries(
                  parsed.map((r) => [r.scheme, { multiplier: r.multiplier, offset: r.offset }]),
                ),
              },
              {
                onSuccess: () => {
                  setDraft(null)
                  showToast('Score scheme conversions saved')
                },
              },
            )
          }
        >
          Save
        </Button>
      </div>
    </Card>
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
