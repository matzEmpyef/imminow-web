import type { ReactNode } from 'react'
import { Trash2 } from 'lucide-react'
import { Button } from '@/components/Button'
import { TextField } from '@/components/TextField'
import { TextAreaField } from '@/components/TextAreaField'
import { SelectField } from '@/components/SelectField'
import { MultiSelect } from '@/components/MultiSelect'
import { Toggle } from '@/components/Toggle'
import type { components } from '@/api/schema'
import { MONTHS, type AptitudeReq, type EnglishReq } from './courseFormShared'
import { useCurrencyCodes } from '@/lib/currencies'
import type { CourseFormValue } from './useCourseForm'
import { useStudyLevels } from '@/queries/studyLevels'
import { useFieldsOfStudy } from '@/queries/fieldsOfStudy'
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

export function CourseBasicsPanel({ hidden, form }: { hidden: boolean; form: CourseFormValue }) {
  const { data: studyLevels } = useStudyLevels()
  const { data: fields } = useFieldsOfStudy()
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
          <SelectField label="Level" value={form.level} onChange={(e) => form.setLevel(e.target.value)}>
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
          <TextField
            label="Language of teaching"
            required
            value={form.language}
            onChange={(e) => form.setLanguage(e.target.value)}
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
          hint="Shown as About the course in the app; without it the app shows nothing."
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
              <span>Open for applications</span>
            </div>
            {form.intakes.map((month) => (
              <div key={month} className="grid grid-cols-3 items-center gap-md px-md py-sm">
                <span className="text-body-sm text-text-primary">{month}</span>
                <input
                  type="date"
                  value={form.deadlines[month]?.deadline ?? ''}
                  onChange={(e) => form.onDeadlineChange(month, { deadline: e.target.value })}
                  aria-label={`${month} application deadline`}
                  className={ROW_CONTROL}
                />
                <Toggle
                  checked={form.deadlines[month]?.open ?? true}
                  onChange={(open) => form.onDeadlineChange(month, { open })}
                  label={`${month} intake open for applications`}
                />
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
          <SelectField
            label="Currency"
            id="course-currency"
            value={form.feeCurrency}
            onChange={(e) => form.setFeeCurrency(e.target.value)}
          >
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
            value={form.effectiveAppFeeCurrency}
            onChange={(e) => form.onAppFeeCurrencyChange(e.target.value)}
            disabled={form.appFeeWaived}
          >
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
          <TextField
            label="Minimum academic score"
            type="number"
            value={form.minScore}
            onChange={(e) => form.setMinScore(e.target.value)}
          />
          <SelectField
            label="Scored as"
            id="req-scheme"
            value={form.scheme}
            onChange={(e) => form.setScheme(e.target.value as 'percentage' | 'cgpa_10' | 'cgpa_4')}
          >
            <option value="percentage">Percentage</option>
            <option value="cgpa_10">CGPA (out of 10)</option>
            <option value="cgpa_4">CGPA (out of 4)</option>
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
