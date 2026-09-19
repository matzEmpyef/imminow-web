import { useState, type ReactNode } from 'react'
import { Trash2 } from 'lucide-react'
import { Button } from '@/components/Button'
import { TextField } from '@/components/TextField'
import { TextAreaField } from '@/components/TextAreaField'
import { SelectField } from '@/components/SelectField'
import { MultiSelect } from '@/components/MultiSelect'
import type { components } from '@/api/schema'
import {
  ENTRY_QUALIFICATIONS,
  INTAKE_STATUSES,
  MONTHS,
  ROLLED_DEADLINE_NOTE,
  SCORE_SCHEMES,
  type AptitudeReq,
  type EnglishReq,
  type EntryQualificationValue,
  type IntakeStatus,
  type ScoreSchemeValue,
} from './courseFormShared'
import { useCurrencyCodes } from '@/lib/currencies'
import type { CourseFormValue } from './useCourseForm'
import { useStudyLevels } from '@/queries/studyLevels'
import { useFieldsOfStudy } from '@/queries/fieldsOfStudy'
import { useCourseLanguages } from '@/queries/courseFinder'
import { useCourses } from '@/queries/courseSuggestions'

type College = components['schemas']['College']
type Exam = components['schemas']['Exam']

// CourseFormModal's five tab panels, extracted from CollegeDetailPage in the 2026-08-25
// decomposition pass (the modal was a single 446-line component). All state stays in the modal —
// now behind useCourseForm.ts (audit item 6, 2026-09-01) — each panel is pure layout over `form`,
// the ONE typed value+handlers object useCourseForm returns, instead of an 18-prop bag.
//
// Layout pass (user, 2026-09-11 — "improve the ui of course edit popup, alignment of fields and
// all"): every panel is titled sections of aligned rows; multi-line fields use TextAreaField so
// they match the pills around them; the repeating rows (deadlines, English tests, aptitude exams)
// are small tables with a header, one control height, and an icon to remove a row.
//
// CRITICAL: every panel stays MOUNTED and hides via the `hidden` class (the `hidden` prop below),
// exactly as the original inline markup did — conditional mounting would throw away in-progress
// form state whenever the admin switches tabs.

const panelClass = (hidden: boolean) => (hidden ? 'hidden' : 'flex flex-col gap-xl')

// One height and shape for the compact controls inside table rows, where a floating label per row
// would repeat the column header.
const ROW_CONTROL =
  'h-10 w-full rounded-full border border-border bg-surface px-4 text-body-sm text-text-primary outline-none focus:border-primary'

function FormSection({ title, hint, action, children }: { title: string; hint?: string; action?: ReactNode; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-md">
      <div className="flex items-start justify-between gap-md">
        <div className="min-w-0">
          <h3 className="text-body-sm font-semibold text-text-primary">{title}</h3>
          {hint && <p className="text-caption text-text-secondary">{hint}</p>}
        </div>
        {action}
      </div>
      {children}
    </section>
  )
}

function CheckRow({
  checked,
  onChange,
  label,
  hint,
}: {
  checked: boolean
  onChange: (checked: boolean) => void
  label: string
  hint?: string
}) {
  return (
    <label className="flex cursor-pointer items-start gap-sm text-body-sm text-text-primary">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 h-4 w-4 shrink-0 accent-primary"
      />
      <span className="flex flex-col">
        <span>{label}</span>
        {hint && <span className="text-caption text-text-secondary">{hint}</span>}
      </span>
    </label>
  )
}

function RemoveRowButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title="Remove"
      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md text-text-secondary hover:bg-background hover:text-error"
    >
      <Trash2 className="h-4 w-4" />
    </button>
  )
}

const ADD_NEW = '__add_new__'

/**
 * A dropdown built off a derived list (like Level and Field of study above), plus an "+ Add
 * new…" row that switches to a plain text field for a value the list does not have yet (product
 * owner, 2026-09-15: "language of instruction needs to be a dropdown with ability to add new
 * there"). Unlike Field of study this has no separate managed-list page behind it — the list is
 * simply whatever the catalogue already uses, and the admin typing a new one here is how it grows.
 *
 * Also switches to the text field on mount if the course already carries a value the list does
 * not have (an older course, or one entered before its language existed anywhere else) — a
 * dropdown that silently dropped that value on the next save would be a data-loss bug, not a UI
 * nicety.
 */
function AddableSelectField({
  label,
  value,
  options,
  onChange,
  required,
  placeholder,
}: {
  label: string
  value: string
  options: string[]
  onChange: (value: string) => void
  required?: boolean
  placeholder?: string
}) {
  const [typing, setTyping] = useState(false)
  if (typing || (value && !options.includes(value))) {
    return (
      <div className="flex flex-col gap-xs">
        <TextField label={label} required={required} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} />
        {options.length > 0 && (
          <button
            type="button"
            className="self-start text-caption text-primary underline"
            onClick={() => {
              setTyping(false)
              onChange('')
            }}
          >
            Choose from the list instead
          </button>
        )}
      </div>
    )
  }
  return (
    <SelectField
      label={label}
      required={required}
      value={value}
      onChange={(e) => (e.target.value === ADD_NEW ? setTyping(true) : onChange(e.target.value))}
    >
      <option value="">Not set</option>
      {options.map((o) => (
        <option key={o} value={o}>
          {o}
        </option>
      ))}
      <option value={ADD_NEW}>+ Add new…</option>
    </SelectField>
  )
}

export function CourseBasicsPanel({ hidden, form }: { hidden: boolean; form: CourseFormValue }) {
  const { data: studyLevels } = useStudyLevels()
  const { data: fields } = useFieldsOfStudy()
  const { data: languages } = useCourseLanguages()
  return (
    <div className={panelClass(hidden)}>
      <FormSection title="Course">
        <TextField label="Course name" required value={form.name} onChange={(e) => form.setName(e.target.value)} />
        <div className="grid grid-cols-1 gap-md sm:grid-cols-2">
          {/*
            A dropdown off the shared ladder since 2026-09-07, not a text box. As free text this
            field could hold "Masters", "MSc" or "PG" while the student app filtered against a
            hardcoded, title-cased four — a course typed either of the last two was invisible to
            every student who filtered by level, and nothing reported it. The server now rejects
            codes outside the table, so the picker is not the only guard, just the one that keeps
            an admin from meeting the guard.
          */}
          {/* Level, Field of study and Delivery are required to save (user, 2026-09-17): each one
              is a filter students search by, and a course missing any of them is invisible to the
              search that should have found it. */}
          <SelectField label="Level" required value={form.level} onChange={(e) => form.setLevel(e.target.value)}>
            <option value="">Not set</option>
            {(studyLevels ?? [])
              .filter((level) => level.active !== false || level.code === form.level)
              .map((level) => (
                <option key={level.code} value={level.code}>
                  {level.label}
                </option>
              ))}
            {/* A level saved before the table existed still shows, so editing another field on
                that course does not silently blank it. */}
            {form.level && !(studyLevels ?? []).some((level) => level.code === form.level) && (
              <option value={form.level}>{form.level} (not in the list)</option>
            )}
          </SelectField>
          {/* From the managed Fields of Study list (2026-09-11), like Level — free text made
              "Computing" and "Computer Science" two different fields in every search. */}
          <SelectField
            label="Field of study"
            required
            value={form.fieldOfStudy}
            onChange={(e) => form.setFieldOfStudy(e.target.value)}
          >
            <option value="">Not set</option>
            {(fields ?? []).map((f) => (
              <option key={f.id} value={f.name}>
                {f.name}
              </option>
            ))}
            {form.fieldOfStudy && !(fields ?? []).some((f) => f.name === form.fieldOfStudy) && (
              <option value={form.fieldOfStudy}>{form.fieldOfStudy} (not in the list)</option>
            )}
          </SelectField>
          <TextField
            label="Credentials"
            value={form.credentials}
            onChange={(e) => form.setCredentials(e.target.value)}
            placeholder="e.g. MSc"
          />
          {/* Derived from the catalogue like Level, with an "+ Add new…" escape hatch like
              Field of study's own management page gives it — but no separate managed list, since
              a language has no aliases or merge story to justify one (product owner, 2026-09-15). */}
          <AddableSelectField
            label="Language of teaching"
            required
            value={form.language}
            options={languages ?? []}
            onChange={form.setLanguage}
            placeholder="e.g. English"
          />
        </div>
      </FormSection>

      <FormSection title="Duration" hint="Students read the text; the number of months drives the duration filter.">
        <div className="grid grid-cols-1 gap-md sm:grid-cols-2">
          <TextField
            label="Shown to students"
            value={form.duration}
            onChange={(e) => form.setDuration(e.target.value)}
            placeholder="e.g. 2 years"
          />
          <TextField
            label="Length in months"
            type="number"
            min="0"
            value={form.durationMonths}
            onChange={(e) => form.setDurationMonths(e.target.value)}
            placeholder="e.g. 24"
          />
        </div>
      </FormSection>

      <FormSection title="Details">
        {/* Optional (user, 2026-09-04) — the app shows it as "Visit course page" in the phone's browser. */}
        <TextField
          label="Course page"
          type="url"
          value={form.courseUrl}
          onChange={(e) => form.setCourseUrl(e.target.value)}
          placeholder="https://www.college.edu/programmes/msc-computer-science"
        />
        <TextAreaField
          label="Description"
          value={form.description}
          onChange={(e) => form.setDescription(e.target.value)}
          rows={3}
          // A capture check since 2026-09-13 (app review H8) — still optional to save, but the
          // meter counts it, so say what the gap costs a student.
        />
        <TextAreaField label="Benefits" value={form.benefits} onChange={(e) => form.setBenefits(e.target.value)} rows={2} />
      </FormSection>
    </div>
  )
}

export function CourseCampusIntakesPanel({
  hidden,
  college,
  form,
}: {
  hidden: boolean
  college: College
  form: CourseFormValue
}) {
  const campuses = college.campuses ?? []
  return (
    <div className={panelClass(hidden)}>
      <FormSection title="Campuses" hint="Where this course is taught.">
        {campuses.length === 0 ? (
          <p className="text-caption text-text-secondary">This college has no campuses yet — add one on its page first.</p>
        ) : (
          <div className="flex flex-col divide-y divide-border rounded-md border border-border">
            <div className="px-md py-sm">
              <CheckRow checked={form.allSelected} onChange={() => form.onToggleAll()} label="All campuses" />
            </div>
            {campuses.map((c) => (
              <div key={c.id} className="px-md py-sm">
                <CheckRow
                  checked={form.campusIds.includes(c.id!)}
                  onChange={() => form.onToggleCampus(c.id!)}
                  label={[c.city, c.province_state, c.country].filter(Boolean).join(', ')}
                />
              </div>
            ))}
          </div>
        )}
        {form.campusRequired && (
          <p className="text-body-sm text-error">
            Pick at least one campus — students only see a course through its campus.
          </p>
        )}
      </FormSection>

      <FormSection title="Intakes" hint="The months this course starts.">
        <MultiSelect label="Intake months" options={MONTHS} selected={form.intakes} onChange={form.setIntakes} />
      </FormSection>

      {form.intakes.length > 0 && (
        <FormSection
          title="Application deadlines"
          hint="Powers the app's “applications open now” filter, earliest-intake sort and closing-soon badges. Leave a deadline blank if unknown — a missing deadline never hides a course."
        >
          <div className="flex flex-col divide-y divide-border rounded-md border border-border">
            <div className="grid grid-cols-3 gap-md bg-background px-md py-xs text-caption font-medium text-text-secondary">
              <span>Intake</span>
              <span>Deadline</span>
              <span>Applications</span>
            </div>
            {/* Three-valued, defaulting to Not set (assumptions audit C10, approved 2026-09-19).
                The Open/Closed toggle this replaces had no way to say "nobody has told us", so
                ticking nine months advertised nine open intakes to students. */}
            {form.intakes.map((month) => (
              <div key={month} className="grid grid-cols-3 items-center gap-md px-md py-sm">
                <span className="text-body-sm text-text-primary">{month}</span>
                <div className="flex flex-col gap-xs">
                  <input
                    type="date"
                    value={form.deadlines[month]?.deadline ?? ''}
                    onChange={(e) => form.onDeadlineChange(month, { deadline: e.target.value })}
                    aria-label={`${month} application deadline`}
                    className={ROW_CONTROL}
                  />
                  {form.rolledMonths.has(month) && (
                    <span className="text-caption text-text-secondary">{ROLLED_DEADLINE_NOTE}</span>
                  )}
                </div>
                <select
                  value={form.deadlines[month]?.status ?? 'unknown'}
                  onChange={(e) => form.onDeadlineChange(month, { status: e.target.value as IntakeStatus })}
                  aria-label={`${month} intake application status`}
                  className={ROW_CONTROL}
                >
                  {INTAKE_STATUSES.map((s) => (
                    <option key={s.value} value={s.value}>
                      {s.label}
                    </option>
                  ))}
                </select>
              </div>
            ))}
          </div>
        </FormSection>
      )}
    </div>
  )
}

export function CourseFeesPanel({
  hidden,
  form,
  collegeId,
  excludeCourseId,
}: {
  hidden: boolean
  form: CourseFormValue
  collegeId: string
  excludeCourseId?: string
}) {
  // A fee can be entered in any currency the rate table holds (2026-09-10) — a fixed six meant a
  // Thai college's fee could not be entered in baht even after THB was added.
  const currencyCodes = useCurrencyCodes(form.feeCurrency, form.effectiveAppFeeCurrency)

  // Soft warning when this course's currency doesn't match the college's other courses (product
  // review, 2026-09-12) — colleges very rarely price different courses in different currencies, so
  // a mismatch is usually a typo, not a decision. Never blocks saving.
  const siblingCourses = useCourses({ collegeId, active: true, limit: 100 })
  const siblingCurrencies = new Set(
    (siblingCourses.data?.items ?? [])
      .filter((c) => c.id !== excludeCourseId && c.fee?.currency)
      .map((c) => c.fee!.currency),
  )
  const currencyMismatch = form.feeAmount !== '' && siblingCurrencies.size > 0 && !siblingCurrencies.has(form.feeCurrency)

  return (
    <div className={panelClass(hidden)}>
      <FormSection title="Tuition">
        <div className="grid grid-cols-1 gap-md sm:grid-cols-3">
          <TextField
            label="Tuition fee"
            type="number"
            min="0"
            value={form.feeAmount}
            onChange={(e) => form.setFeeAmount(e.target.value)}
          />
          {/* No INR default (assumptions audit C5, approved 2026-09-19) — the campus's country
              fills this while it is empty, and an amount typed without one blocks the save. */}
          <SelectField
            label="Currency"
            id="course-currency"
            required={form.feeAmount !== ''}
            value={form.feeCurrency}
            onChange={(e) => form.setFeeCurrency(e.target.value)}
            error={form.feeCurrencyError}
          >
            <option value="">Not set</option>
            {currencyCodes.map((currency) => (
              <option key={currency} value={currency}>
                {currency}
              </option>
            ))}
          </SelectField>
          <SelectField
            label="Covers"
            id="course-fee-period"
            value={form.feePeriod}
            onChange={(e) => form.setFeePeriod(e.target.value as 'per_year' | 'total')}
          >
            <option value="per_year">Per year</option>
            <option value="total">Total programme</option>
          </SelectField>
        </div>
        {currencyMismatch && (
          <p className="text-caption text-warning">
            This college&rsquo;s other courses are priced in {[...siblingCurrencies].join(', ')} — double-check {form.feeCurrency} is right.
          </p>
        )}
      </FormSection>

      <FormSection title="Application fee">
        <div className="grid grid-cols-1 items-center gap-md sm:grid-cols-3">
          <TextField
            label="Application fee"
            type="number"
            min="0"
            value={form.appFeeAmount}
            onChange={(e) => form.setAppFeeAmount(e.target.value)}
            disabled={form.appFeeWaived}
          />
          <SelectField
            label="Currency"
            id="app-fee-currency"
            required={form.appFeeAmount !== '' && !form.appFeeWaived}
            value={form.effectiveAppFeeCurrency}
            onChange={(e) => form.onAppFeeCurrencyChange(e.target.value)}
            disabled={form.appFeeWaived}
            error={form.appFeeCurrencyError}
          >
            <option value="">Not set</option>
            {currencyCodes.map((currency) => (
              <option key={currency} value={currency}>
                {currency}
              </option>
            ))}
          </SelectField>
          <CheckRow checked={form.appFeeWaived} onChange={form.setAppFeeWaived} label="Waived" />
        </div>
      </FormSection>

      <FormSection title="Scholarship">
        <CheckRow checked={form.scholarship} onChange={form.setScholarship} label="Scholarship available" />
        {form.scholarship && (
          <TextField
            label="Scholarship note"
            value={form.scholarshipNote ?? ''}
            onChange={(e) => form.setScholarshipNote(e.target.value)}
            placeholder="e.g. Merit scholarships cover up to 25% tuition."
          />
        )}
      </FormSection>
    </div>
  )
}

function ExamSelect({
  value,
  exams,
  placeholder,
  label,
  onChange,
}: {
  value: string
  exams: Exam[]
  placeholder: string
  label: string
  onChange: (value: string) => void
}) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} className={ROW_CONTROL} aria-label={label}>
      <option value="">{placeholder}</option>
      {exams.map((exam) => (
        <option key={exam.id} value={exam.id}>
          {exam.name}
        </option>
      ))}
    </select>
  )
}

function EnglishRequirementRow(p: {
  row: EnglishReq
  exams: Exam[]
  onChange: (patch: Partial<EnglishReq>) => void
  onRemove: () => void
}) {
  return (
    <div className="grid grid-cols-7 items-center gap-sm px-md py-sm">
      <div className="col-span-3">
        <ExamSelect
          value={p.row.exam_id}
          exams={p.exams}
          placeholder="Choose a test…"
          label="English test"
          onChange={(exam_id) => p.onChange({ exam_id })}
        />
      </div>
      <input
        type="number"
        placeholder="e.g. 6.5"
        aria-label="Minimum overall score"
        value={p.row.min_overall}
        onChange={(e) => p.onChange({ min_overall: e.target.value })}
        className={`${ROW_CONTROL} col-span-2`}
      />
      <input
        type="number"
        placeholder="e.g. 6"
        aria-label="Minimum band score"
        value={p.row.min_band}
        onChange={(e) => p.onChange({ min_band: e.target.value })}
        className={ROW_CONTROL}
      />
      <div className="flex justify-end">
        <RemoveRowButton label="Remove this English test" onClick={p.onRemove} />
      </div>
    </div>
  )
}

function AptitudeRequirementRow(p: {
  row: AptitudeReq
  exams: Exam[]
  onChange: (patch: Partial<AptitudeReq>) => void
  onRemove: () => void
}) {
  return (
    <div className="grid grid-cols-7 items-center gap-sm px-md py-sm">
      <div className="col-span-3">
        <ExamSelect
          value={p.row.exam_id}
          exams={p.exams}
          placeholder="Choose an exam…"
          label="Aptitude exam"
          onChange={(exam_id) => p.onChange({ exam_id })}
        />
      </div>
      <input
        type="number"
        placeholder="e.g. 310"
        aria-label="Minimum score"
        value={p.row.min_score}
        onChange={(e) => p.onChange({ min_score: e.target.value })}
        className={`${ROW_CONTROL} col-span-2`}
      />
      <div className="flex justify-center">
        <input
          type="checkbox"
          checked={p.row.required}
          onChange={(e) => p.onChange({ required: e.target.checked })}
          aria-label="Required"
          className="h-4 w-4 accent-primary"
        />
      </div>
      <div className="flex justify-end">
        <RemoveRowButton label="Remove this exam" onClick={p.onRemove} />
      </div>
    </div>
  )
}

export function CourseRequirementsPanel({
  hidden,
  activeExams,
  form,
}: {
  hidden: boolean
  activeExams: Exam[]
  form: CourseFormValue
}) {
  return (
    <div className={panelClass(hidden)}>
      <p className="rounded-md bg-background px-md py-sm text-caption text-text-secondary">
        Every field is optional — an empty field means &ldquo;no requirement&rdquo;, and only rules you fill in are
        ever checked against a student. Exams come from Catalog Settings.
      </p>

      <FormSection title="Academic">
        <div className="grid grid-cols-1 gap-md sm:grid-cols-2">
          {/* The one qualification the minimum score is measured on (2026-09-17). Starts at "Not
              set" and is no longer pre-filled from the course level (assumptions audit C1,
              approved 2026-09-19) — the guess was saved as fact, so a Diploma or PhD course
              measured applicants against the 12th. Required once a score is entered. */}
          <SelectField
            label="Minimum qualification"
            id="req-entry-qualification"
            required={form.minScore !== ''}
            value={form.entryQualification}
            onChange={(e) => form.setEntryQualification(e.target.value as EntryQualificationValue)}
            error={form.entryQualificationError}
          >
            <option value="">Not set</option>
            {ENTRY_QUALIFICATIONS.map((q) => (
              <option key={q.value} value={q.value}>
                {q.label}
              </option>
            ))}
          </SelectField>
          <TextField
            label="Minimum academic score"
            type="number"
            value={form.minScore}
            onChange={(e) => form.setMinScore(e.target.value)}
          />
          {/* No pre-selected Percentage either (assumptions audit C3) — a 4-point GPA of 3.5
              typed into a field already reading "Percentage" saved a 3.5 % floor. */}
          <SelectField
            label="Scored as"
            id="req-scheme"
            required={form.minScore !== ''}
            value={form.scheme}
            onChange={(e) => form.setScheme(e.target.value as ScoreSchemeValue)}
            error={form.schemeError}
          >
            <option value="">Not set</option>
            {SCORE_SCHEMES.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </SelectField>
          <TextField
            label="Maximum backlogs"
            type="number"
            min="0"
            value={form.maxBacklogs}
            onChange={(e) => form.setMaxBacklogs(e.target.value)}
          />
          <TextField
            label="Work experience (months)"
            type="number"
            min="0"
            value={form.workExpMonths}
            onChange={(e) => form.setWorkExpMonths(e.target.value)}
          />
        </div>
        <TextField
          label="Required background"
          value={form.background ?? ''}
          onChange={(e) => form.setBackground(e.target.value)}
          placeholder="e.g. CS or related 4-year bachelor's"
        />
      </FormSection>

      <FormSection
        title="English tests"
        hint="Any one of these qualifies."
        action={
          <Button type="button" variant="secondary" size="sm" onClick={form.onAddEnglish}>
            Add test
          </Button>
        }
      >
        {form.english.length === 0 ? (
          <p className="text-caption text-text-secondary">No English test required.</p>
        ) : (
          <div className="flex flex-col divide-y divide-border rounded-md border border-border">
            <div className="grid grid-cols-7 gap-sm bg-background px-md py-xs text-caption font-medium text-text-secondary">
              <span className="col-span-3">Test</span>
              <span className="col-span-2">Minimum overall</span>
              <span>Minimum band</span>
              <span />
            </div>
            {form.english.map((row, i) => (
              <EnglishRequirementRow
                key={i}
                row={row}
                exams={activeExams}
                onChange={(patch) => form.onChangeEnglish(i, patch)}
                onRemove={() => form.onRemoveEnglish(i)}
              />
            ))}
          </div>
        )}
        <CheckRow
          checked={form.moiAccepted}
          onChange={form.setMoiAccepted}
          label="Medium of Instruction letter accepted instead of a test"
        />
      </FormSection>

      <FormSection
        title="Aptitude / entrance exams"
        action={
          <Button type="button" variant="secondary" size="sm" onClick={form.onAddAptitude}>
            Add exam
          </Button>
        }
      >
        {form.aptitude.length === 0 ? (
          <p className="text-caption text-text-secondary">No entrance exam required.</p>
        ) : (
          <div className="flex flex-col divide-y divide-border rounded-md border border-border">
            <div className="grid grid-cols-7 gap-sm bg-background px-md py-xs text-caption font-medium text-text-secondary">
              <span className="col-span-3">Exam</span>
              <span className="col-span-2">Minimum score</span>
              <span className="text-center">Required</span>
              <span />
            </div>
            {form.aptitude.map((row, i) => (
              <AptitudeRequirementRow
                key={i}
                row={row}
                exams={activeExams}
                onChange={(patch) => form.onChangeAptitude(i, patch)}
                onRemove={() => form.onRemoveAptitude(i)}
              />
            ))}
          </div>
        )}
      </FormSection>

      <FormSection title="Eligibility note">
        <TextAreaField
          label="Eligibility note"
          hint="Shown to students beside the structured checks."
          value={form.eligibility}
          onChange={(e) => form.setEligibility(e.target.value)}
          rows={2}
        />
      </FormSection>
    </div>
  )
}

export function CourseFlagsPanel({ hidden, form }: { hidden: boolean; form: CourseFormValue }) {
  return (
    <div className={panelClass(hidden)}>
      <FormSection title="Format">
        <div className="grid grid-cols-1 gap-md sm:grid-cols-2">
          <SelectField
            label="Study mode"
            id="course-study-mode"
            value={form.studyMode ?? ''}
            onChange={(e) => form.setStudyMode(e.target.value)}
          >
            <option value="">Not specified</option>
            <option value="full_time">Full time</option>
            <option value="part_time">Part time</option>
          </SelectField>
          <SelectField
            label="Delivery"
            required
            id="course-delivery"
            value={form.delivery ?? ''}
            onChange={(e) => form.setDelivery(e.target.value)}
          >
            <option value="">Not specified</option>
            <option value="on_campus">On campus</option>
            <option value="hybrid">Hybrid</option>
            <option value="online">Online</option>
          </SelectField>
        </div>
      </FormSection>

      <FormSection title="Work opportunities">
        <div className="flex flex-col divide-y divide-border rounded-md border border-border">
          <div className="px-md py-sm">
            <CheckRow
              checked={form.coop}
              onChange={form.setCoop}
              label="Co-op / internship available"
              hint="Students can filter for courses with paid work placements."
            />
          </div>
          <div className="px-md py-sm">
            <CheckRow
              checked={form.psw}
              onChange={form.setPsw}
              label="Post-study work eligible"
              hint="Graduates can apply for a work permit after the course."
            />
          </div>
        </div>
      </FormSection>
    </div>
  )
}
