import { Button } from '@/components/Button'
import { TextField } from '@/components/TextField'
import { SelectField } from '@/components/SelectField'
import { MultiSelect } from '@/components/MultiSelect'
import { FieldLabel } from '@/components/FieldLabel'
import type { components } from '@/api/schema'
import { CURRENCIES, MONTHS, SELECT_CLASS, TEXTAREA_CLASS, type AptitudeReq, type EnglishReq } from './courseFormShared'
import type { CourseFormValue } from './useCourseForm'

type College = components['schemas']['College']
type Exam = components['schemas']['Exam']

// CourseFormModal's five tab panels, extracted from CollegeDetailPage in the 2026-08-25
// decomposition pass (the modal was a single 446-line component). All state stays in the modal —
// now behind useCourseForm.ts (audit item 6, 2026-09-01) — each panel is pure layout over `form`,
// the ONE typed value+handlers object useCourseForm returns, instead of an 18-prop bag.
//
// CRITICAL: every panel stays MOUNTED and hides via the `hidden` class (the `hidden` prop below),
// exactly as the original inline markup did — conditional mounting would throw away in-progress
// form state whenever the admin switches tabs.

const panelClass = (hidden: boolean) => (hidden ? 'hidden' : 'flex flex-col gap-md')

export function CourseBasicsPanel({ hidden, form }: { hidden: boolean; form: CourseFormValue }) {
  return (
    <div className={panelClass(hidden)}>
      <TextField label="Course name" required value={form.name} onChange={(e) => form.setName(e.target.value)} />
      <div className="flex flex-col gap-xs">
        <FieldLabel htmlFor="course-description">Description</FieldLabel>
        <textarea
          id="course-description"
          value={form.description}
          onChange={(e) => form.setDescription(e.target.value)}
          rows={2}
          className={TEXTAREA_CLASS}
        />
      </div>
      <div className="grid grid-cols-2 gap-sm">
        <TextField
          label="Level"
          value={form.level}
          onChange={(e) => form.setLevel(e.target.value)}
          placeholder="e.g. masters"
        />
        <TextField
          label="Field of study"
          value={form.fieldOfStudy}
          onChange={(e) => form.setFieldOfStudy(e.target.value)}
        />
      </div>
      <div className="grid grid-cols-3 gap-sm">
        <TextField
          label="Duration (display)"
          value={form.duration}
          onChange={(e) => form.setDuration(e.target.value)}
          placeholder="e.g. 2 years"
        />
        <TextField
          label="Duration (months — used for filters)"
          type="number"
          value={form.durationMonths}
          onChange={(e) => form.setDurationMonths(e.target.value)}
        />
        <TextField
          label="Credentials"
          value={form.credentials}
          onChange={(e) => form.setCredentials(e.target.value)}
          placeholder="e.g. MSc"
        />
      </div>
      <TextField
        label="Language of teaching"
        required
        value={form.language}
        onChange={(e) => form.setLanguage(e.target.value)}
        placeholder="e.g. English"
      />
      <div className="flex flex-col gap-xs">
        <FieldLabel htmlFor="course-benefits">Benefits</FieldLabel>
        <textarea
          id="course-benefits"
          value={form.benefits}
          onChange={(e) => form.setBenefits(e.target.value)}
          rows={2}
          className={TEXTAREA_CLASS}
        />
      </div>
    </div>
  )
}

function IntakeDeadlineRow(p: {
  month: string
  deadline: string
  open: boolean
  onDeadlineChange: (value: string) => void
  onOpenChange: (open: boolean) => void
}) {
  return (
    <div className="flex items-center gap-sm">
      <span className="w-24 text-body-sm text-text-primary">{p.month}</span>
      <input
        type="date"
        value={p.deadline}
        onChange={(e) => p.onDeadlineChange(e.target.value)}
        aria-label={`${p.month} application deadline`}
        className="h-9 rounded-md border border-border bg-surface px-2 text-body-sm"
      />
      <label className="flex items-center gap-xs text-body-sm text-text-secondary">
        <input
          type="checkbox"
          checked={p.open}
          onChange={(e) => p.onOpenChange(e.target.checked)}
          className="h-4 w-4"
        />
        Open
      </label>
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
  return (
    <div className={panelClass(hidden)}>
      <div className="flex flex-col gap-xs">
        <p className="text-body-sm font-medium text-text-primary">Campuses</p>
        <label className="flex items-center gap-xs text-body-sm">
          <input type="checkbox" checked={form.allSelected} onChange={form.onToggleAll} className="h-4 w-4" />
          All campuses
        </label>
        <div className="flex flex-col gap-xs pl-md">
          {(college.campuses ?? []).map((c) => (
            <label key={c.id} className="flex items-center gap-xs text-body-sm">
              <input
                type="checkbox"
                checked={form.campusIds.includes(c.id!)}
                onChange={() => form.onToggleCampus(c.id!)}
                className="h-4 w-4"
              />
              {c.city ? `${c.city}, ` : ''}
              {c.province_state}, {c.country}
            </label>
          ))}
        </div>
      </div>
      <MultiSelect label="Intakes" options={MONTHS} selected={form.intakes} onChange={form.setIntakes} />
      {form.intakes.length > 0 && (
        <div className="flex flex-col gap-xs">
          <p className="text-body-sm font-medium text-text-primary">Application deadlines</p>
          <p className="text-caption text-text-secondary">
            Powers the app's "applications open now" filter, earliest-intake sort and closing-soon badges. Leave blank
            if unknown — no deadline never hides a course.
          </p>
          {form.intakes.map((month) => (
            <IntakeDeadlineRow
              key={month}
              month={month}
              deadline={form.deadlines[month]?.deadline ?? ''}
              open={form.deadlines[month]?.open ?? true}
              onDeadlineChange={(value) => form.onDeadlineChange(month, { deadline: value })}
              onOpenChange={(open) => form.onDeadlineChange(month, { open })}
            />
          ))}
        </div>
      )}
    </div>
  )
}

export function CourseFeesPanel({ hidden, form }: { hidden: boolean; form: CourseFormValue }) {
  return (
    <div className={panelClass(hidden)}>
      <div className="grid grid-cols-3 gap-sm">
        <TextField
          label="Tuition fee"
          type="number"
          value={form.feeAmount}
          onChange={(e) => form.setFeeAmount(e.target.value)}
        />
        <SelectField
          label="Currency"
          id="course-currency"
          value={form.feeCurrency}
          onChange={(e) => form.setFeeCurrency(e.target.value)}
        >
          {CURRENCIES.map((currency) => (
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
      <div className="grid grid-cols-3 items-end gap-sm">
        <TextField
          label="Application fee"
          type="number"
          value={form.appFeeAmount}
          onChange={(e) => form.setAppFeeAmount(e.target.value)}
        />
        <SelectField
          label="Currency"
          id="app-fee-currency"
          value={form.effectiveAppFeeCurrency}
          onChange={(e) => form.onAppFeeCurrencyChange(e.target.value)}
        >
          {CURRENCIES.map((currency) => (
            <option key={currency} value={currency}>
              {currency}
            </option>
          ))}
        </SelectField>
        <label className="flex h-10 items-center gap-sm text-body-sm text-text-primary">
          <input
            type="checkbox"
            checked={form.appFeeWaived}
            onChange={(e) => form.setAppFeeWaived(e.target.checked)}
            className="h-4 w-4"
          />
          Application fee waived
        </label>
      </div>
      <label className="flex items-center gap-sm text-body-sm text-text-primary">
        <input
          type="checkbox"
          checked={form.scholarship}
          onChange={(e) => form.setScholarship(e.target.checked)}
          className="h-4 w-4"
        />
        Scholarship available
      </label>
      {form.scholarship && (
        <TextField
          label="Scholarship note"
          value={form.scholarshipNote ?? ''}
          onChange={(e) => form.setScholarshipNote(e.target.value)}
          placeholder="e.g. Merit scholarships cover up to 25% tuition."
        />
      )}
    </div>
  )
}

function EnglishRequirementRow(p: {
  row: EnglishReq
  exams: Exam[]
  onChange: (patch: Partial<EnglishReq>) => void
  onRemove: () => void
}) {
  return (
    <div className="flex items-center gap-sm">
      <select
        value={p.row.exam_id}
        onChange={(e) => p.onChange({ exam_id: e.target.value })}
        className={`${SELECT_CLASS} flex-1`}
        aria-label="English test"
      >
        <option value="">Select test…</option>
        {p.exams.map((exam) => (
          <option key={exam.id} value={exam.id}>
            {exam.name}
          </option>
        ))}
      </select>
      <input
        type="number"
        placeholder="Min overall"
        aria-label="Minimum overall score"
        value={p.row.min_overall}
        onChange={(e) => p.onChange({ min_overall: e.target.value })}
        className="h-10 w-28 rounded-md border border-border bg-surface px-2 text-body-sm"
      />
      <input
        type="number"
        placeholder="Min band"
        aria-label="Minimum band score"
        value={p.row.min_band}
        onChange={(e) => p.onChange({ min_band: e.target.value })}
        className="h-10 w-24 rounded-md border border-border bg-surface px-2 text-body-sm"
      />
      <Button type="button" variant="secondary" size="sm" onClick={p.onRemove}>
        Remove
      </Button>
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
    <div className="flex items-center gap-sm">
      <select
        value={p.row.exam_id}
        onChange={(e) => p.onChange({ exam_id: e.target.value })}
        className={`${SELECT_CLASS} flex-1`}
        aria-label="Aptitude exam"
      >
        <option value="">Select exam…</option>
        {p.exams.map((exam) => (
          <option key={exam.id} value={exam.id}>
            {exam.name}
          </option>
        ))}
      </select>
      <input
        type="number"
        placeholder="Min score"
        aria-label="Minimum score"
        value={p.row.min_score}
        onChange={(e) => p.onChange({ min_score: e.target.value })}
        className="h-10 w-28 rounded-md border border-border bg-surface px-2 text-body-sm"
      />
      <label className="flex items-center gap-xs text-body-sm text-text-secondary">
        <input
          type="checkbox"
          checked={p.row.required}
          onChange={(e) => p.onChange({ required: e.target.checked })}
          className="h-4 w-4"
        />
        Required
      </label>
      <Button type="button" variant="secondary" size="sm" onClick={p.onRemove}>
        Remove
      </Button>
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
      <p className="text-caption text-text-secondary">
        Every field is optional — an empty field means "no requirement", and only rules you fill in are ever checked
        against a student. Exams come from Catalog Settings.
      </p>
      <div className="grid grid-cols-4 gap-sm">
        <TextField
          label="Min academic score"
          type="number"
          value={form.minScore}
          onChange={(e) => form.setMinScore(e.target.value)}
        />
        <SelectField
          label="Scheme"
          id="req-scheme"
          value={form.scheme}
          onChange={(e) => form.setScheme(e.target.value as 'percentage' | 'cgpa_10' | 'cgpa_4')}
        >
          <option value="percentage">Percentage</option>
          <option value="cgpa_10">CGPA (10)</option>
          <option value="cgpa_4">CGPA (4)</option>
        </SelectField>
        <TextField
          label="Max backlogs"
          type="number"
          value={form.maxBacklogs}
          onChange={(e) => form.setMaxBacklogs(e.target.value)}
        />
        <TextField
          label="Min work exp (months)"
          type="number"
          value={form.workExpMonths}
          onChange={(e) => form.setWorkExpMonths(e.target.value)}
        />
      </div>
      <TextField
        label="Required background"
        value={form.background ?? ''}
        onChange={(e) => form.setBackground(e.target.value)}
        placeholder='e.g. "CS or related 4-year bachelor"'
      />
      <div className="flex flex-col gap-xs">
        <div className="flex items-center justify-between">
          <p className="text-body-sm font-medium text-text-primary">English requirements (any one test qualifies)</p>
          <Button type="button" variant="secondary" size="sm" onClick={form.onAddEnglish}>
            Add test
          </Button>
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
        <label className="flex items-center gap-sm text-body-sm text-text-primary">
          <input
            type="checkbox"
            checked={form.moiAccepted}
            onChange={(e) => form.setMoiAccepted(e.target.checked)}
            className="h-4 w-4"
          />
          Medium of Instruction letter accepted in lieu of a test
        </label>
      </div>
      <div className="flex flex-col gap-xs">
        <div className="flex items-center justify-between">
          <p className="text-body-sm font-medium text-text-primary">Aptitude / entrance exams</p>
          <Button type="button" variant="secondary" size="sm" onClick={form.onAddAptitude}>
            Add exam
          </Button>
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
      <div className="flex flex-col gap-xs">
        <FieldLabel htmlFor="course-eligibility">
          Eligibility note (shown to students beside the structured checks)
        </FieldLabel>
        <textarea
          id="course-eligibility"
          value={form.eligibility}
          onChange={(e) => form.setEligibility(e.target.value)}
          rows={2}
          className={TEXTAREA_CLASS}
        />
      </div>
    </div>
  )
}

export function CourseFlagsPanel({ hidden, form }: { hidden: boolean; form: CourseFormValue }) {
  return (
    <div className={panelClass(hidden)}>
      <div className="grid grid-cols-2 gap-sm">
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
      <label className="flex items-center gap-sm text-body-sm text-text-primary">
        <input
          type="checkbox"
          checked={form.coop}
          onChange={(e) => form.setCoop(e.target.checked)}
          className="h-4 w-4"
        />
        Co-op / internship available
      </label>
      <label className="flex items-center gap-sm text-body-sm text-text-primary">
        <input type="checkbox" checked={form.psw} onChange={(e) => form.setPsw(e.target.checked)} className="h-4 w-4" />
        Post-study work eligible
      </label>
    </div>
  )
}
