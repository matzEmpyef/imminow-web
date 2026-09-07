import { useState, type FormEvent } from 'react'
import { Archive, ArchiveRestore, ChevronDown, ChevronUp, Pencil } from 'lucide-react'
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
  useUpdateExam,
  useUpsertExchangeRate,
  usePlatformSettings,
  useUpdatePlatformSettings,
} from '@/queries/catalogSettings'
import { useCreateStudyLevel, useStudyLevels, useUpdateStudyLevel } from '@/queries/studyLevels'
import { formatDate } from '@/lib/time'
import type { components } from '@/api/schema'

type Exam = components['schemas']['Exam']
type ExchangeRate = components['schemas']['ExchangeRate']
type StudyLevel = components['schemas']['StudyLevel']

const TABS = ['Exams', 'Study Levels', 'Exchange Rates', 'Course Popularity'] as const

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
  const [activeTab, setActiveTab] = useState<(typeof TABS)[number]>('Exams')

  return (
    <AdminShell>
      <div className="flex flex-col gap-lg">
        <h1 className="text-h1 text-text-primary">Catalog Settings</h1>
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
        {activeTab === 'Exams' ? (
          <ExamsTab />
        ) : activeTab === 'Study Levels' ? (
          <StudyLevelsTab />
        ) : activeTab === 'Exchange Rates' ? (
          <ExchangeRatesTab />
        ) : (
          <CoursePopularityTab />
        )}
      </div>
    </AdminShell>
  )
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
      render: (e) => (
        <span className="text-text-secondary">
          {e.min_value != null || e.max_value != null ? `${e.min_value ?? '–'} to ${e.max_value ?? '–'}` : '—'}
        </span>
      ),
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
      <div className="flex items-center justify-between">
        <p className="max-w-2xl text-body-sm text-text-secondary">
          One shared list: students pick from it when adding scores to their profile, and course Entry Requirements
          reference it. Deactivating an exam hides it from new use — stored student scores are untouched.
        </p>
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
    if (isEditing) updateExam.mutate(body, { onSuccess: onClose })
    else createExam.mutate(body, { onSuccess: onClose })
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
      <div className="flex items-center justify-between">
        <p className="max-w-2xl text-body-sm text-text-secondary">
          One ladder, read in two places: the level a course teaches at, and the level a student says they are aiming
          for. Search matches one against the other, so they have to be the same list — a rung added here appears in
          the course form and in the Sentpo app&apos;s Target study level picker with no app release.
        </p>
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

function StudyLevelRowActions({ level, onRename }: { level: StudyLevel; onRename: () => void }) {
  const update = useUpdateStudyLevel()
  const [confirming, setConfirming] = useState(false)
  const retired = level.active === false

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
                  update.mutate({ code: level.code, active: false }, { onSuccess: () => setConfirming(false) })
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
    if (isEditing) updateLevel.mutate({ code: level!.code, label: label.trim() }, { onSuccess: onClose })
    else createLevel.mutate({ label: label.trim(), code: effectiveCode }, { onSuccess: onClose })
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

function ExchangeRatesTab() {
  const rates = useExchangeRates()
  const [editing, setEditing] = useState<ExchangeRate | null>(null)
  const [adding, setAdding] = useState(false)

  const columns: TableColumn<ExchangeRate>[] = [
    {
      key: 'currency',
      header: 'Currency',
      render: (r) => <span className="font-medium text-text-primary">{r.currency}</span>,
    },
    {
      key: 'rate',
      header: '₹ per unit',
      render: (r) => <span className="text-text-secondary">₹{r.inr_per_unit}</span>,
    },
    {
      key: 'updated',
      header: 'Last updated',
      hideBelow: 'sm',
      render: (r) => <span className="text-text-secondary">{r.updated_at ? formatDate(r.updated_at) : '—'}</span>,
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
      <div className="flex items-center justify-between">
        <p className="max-w-2xl text-body-sm text-text-secondary">
          Course fees stay in their native currency everywhere they're shown; these rates only power the app's
          cross-currency fee filter and sort. Changing a rate takes effect on the next search.
        </p>
        <Button size="sm" onClick={() => setAdding(true)}>
          Add Currency
        </Button>
      </div>
      <Table
        columns={columns}
        rows={rates.data ?? []}
        rowKey={(r) => r.currency}
        loading={rates.isLoading}
        error={rates.isError ? 'Could not load exchange rates.' : undefined}
        emptyMessage="No rates yet."
      />
      {(editing || adding) && (
        <RateFormModal
          rate={editing ?? undefined}
          onClose={() => {
            setEditing(null)
            setAdding(false)
          }}
        />
      )}
    </div>
  )
}

function RateFormModal({ rate, onClose }: { rate?: ExchangeRate; onClose: () => void }) {
  const upsert = useUpsertExchangeRate()
  const [currency, setCurrency] = useState(rate?.currency ?? '')
  const [inrPerUnit, setInrPerUnit] = useState(rate ? String(rate.inr_per_unit) : '')
  const valid = currency.trim().length === 3 && Number(inrPerUnit) > 0

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!valid) return
    upsert.mutate({ currency: currency.trim().toUpperCase(), inr_per_unit: Number(inrPerUnit) }, { onSuccess: onClose })
  }

  return (
    <Modal
      onClose={onClose}
      title={rate ? `Edit ${rate.currency} Rate` : 'Add Currency'}
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
          disabled={Boolean(rate)}
        />
        <TextField
          label="₹ per unit of this currency"
          required
          type="number"
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
