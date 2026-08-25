import { Button } from '@/components/Button'
import { TextField } from '@/components/TextField'
import { SelectField } from '@/components/SelectField'
import { MultiSelect } from '@/components/MultiSelect'
import { FieldLabel } from '@/components/FieldLabel'
import type { components } from '@/api/schema'
import { CURRENCIES, MONTHS, SELECT_CLASS, TEXTAREA_CLASS, type AptitudeReq, type EnglishReq } from './courseFormShared'

type College = components['schemas']['College']
type Exam = components['schemas']['Exam']

// CourseFormModal's five tab panels, extracted from CollegeDetailPage in the 2026-08-25
// decomposition pass (the modal was a single 446-line component). All state stays in the modal;
// each panel is pure layout over values + setters.
//
// CRITICAL: every panel stays MOUNTED and hides via the `hidden` class (the `hidden` prop below),
// exactly as the original inline markup did — conditional mounting would throw away in-progress
// form state whenever the admin switches tabs.

const panelClass = (hidden: boolean) => (hidden ? 'hidden' : 'flex flex-col gap-md')

export function CourseBasicsPanel(p: {
  hidden: boolean
  name: string
  setName: (v: string) => void
  description: string
  setDescription: (v: string) => void
  level: string
  setLevel: (v: string) => void
  fieldOfStudy: string
  setFieldOfStudy: (v: string) => void
  duration: string
  setDuration: (v: string) => void
  durationMonths: string
  setDurationMonths: (v: string) => void
  credentials: string
  setCredentials: (v: string) => void
  language: string
  setLanguage: (v: string) => void
  benefits: string
  setBenefits: (v: string) => void
}) {
  return (
    <div className={panelClass(p.hidden)}>
      <TextField label="Course name" required value={p.name} onChange={(e) => p.setName(e.target.value)} />
      <div className="flex flex-col gap-xs">
        <FieldLabel htmlFor="course-description">Description</FieldLabel>
        <textarea
          id="course-description"
          value={p.description}
          onChange={(e) => p.setDescription(e.target.value)}
          rows={2}
          className={TEXTAREA_CLASS}
        />
      </div>
      <div className="grid grid-cols-2 gap-sm">
        <TextField
          label="Level"
          value={p.level}
          onChange={(e) => p.setLevel(e.target.value)}
          placeholder="e.g. masters"
        />
        <TextField label="Field of study" value={p.fieldOfStudy} onChange={(e) => p.setFieldOfStudy(e.target.value)} />
      </div>
      <div className="grid grid-cols-3 gap-sm">
        <TextField
          label="Duration (display)"
          value={p.duration}
          onChange={(e) => p.setDuration(e.target.value)}
          placeholder="e.g. 2 years"
        />
        <TextField
          label="Duration (months — used for filters)"
          type="number"
          value={p.durationMonths}
          onChange={(e) => p.setDurationMonths(e.target.value)}
        />
        <TextField
          label="Credentials"
          value={p.credentials}
          onChange={(e) => p.setCredentials(e.target.value)}
          placeholder="e.g. MSc"
        />
      </div>
      <TextField
        label="Language of teaching"
        required
        value={p.language}
        onChange={(e) => p.setLanguage(e.target.value)}
        placeholder="e.g. English"
      />
      <div className="flex flex-col gap-xs">
        <FieldLabel htmlFor="course-benefits">Benefits</FieldLabel>
        <textarea
          id="course-benefits"
          value={p.benefits}
          onChange={(e) => p.setBenefits(e.target.value)}
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

export function CourseCampusIntakesPanel(p: {
  hidden: boolean
  college: College
  campusIds: string[]
  onToggleCampus: (id: string) => void
  allSelected: boolean
  onToggleAll: () => void
  intakes: string[]
  setIntakes: (v: string[]) => void
  deadlines: Record<string, { deadline: string; open: boolean }>
  setDeadlines: React.Dispatch<React.SetStateAction<Record<string, { deadline: string; open: boolean }>>>
}) {
  return (
    <div className={panelClass(p.hidden)}>
      <div className="flex flex-col gap-xs">
        <p className="text-body-sm font-medium text-text-primary">Campuses</p>
        <label className="flex items-center gap-xs text-body-sm">
          <input type="checkbox" checked={p.allSelected} onChange={p.onToggleAll} className="h-4 w-4" />
          All campuses
        </label>
        <div className="flex flex-col gap-xs pl-md">
          {(p.college.campuses ?? []).map((c) => (
            <label key={c.id} className="flex items-center gap-xs text-body-sm">
              <input
                type="checkbox"
                checked={p.campusIds.includes(c.id!)}
                onChange={() => p.onToggleCampus(c.id!)}
                className="h-4 w-4"
              />
              {c.city ? `${c.city}, ` : ''}
              {c.province_state}, {c.country}
            </label>
          ))}
        </div>
      </div>
      <MultiSelect label="Intakes" options={MONTHS} selected={p.intakes} onChange={p.setIntakes} />
      {p.intakes.length > 0 && (
        <div className="flex flex-col gap-xs">
          <p className="text-body-sm font-medium text-text-primary">Application deadlines</p>
          <p className="text-caption text-text-secondary">
            Powers the app's "applications open now" filter, earliest-intake sort and closing-soon badges. Leave blank
            if unknown — no deadline never hides a course.
          </p>
          {p.intakes.map((month) => (
            <IntakeDeadlineRow
              key={month}
              month={month}
              deadline={p.deadlines[month]?.deadline ?? ''}
              open={p.deadlines[month]?.open ?? true}
              onDeadlineChange={(value) =>
                p.setDeadlines((prev) => ({ ...prev, [month]: { deadline: value, open: prev[month]?.open ?? true } }))
              }
              onOpenChange={(open) =>
                p.setDeadlines((prev) => ({ ...prev, [month]: { deadline: prev[month]?.deadline ?? '', open } }))
              }
            />
          ))}
        </div>
      )}
    </div>
  )
}

export function CourseFeesPanel(p: {
  hidden: boolean
  feeAmount: string
  setFeeAmount: (v: string) => void
  feeCurrency: string
  setFeeCurrency: (v: string) => void
  feePeriod: 'per_year' | 'total'
  setFeePeriod: (v: 'per_year' | 'total') => void
  appFeeAmount: string
  setAppFeeAmount: (v: string) => void
  effectiveAppFeeCurrency: string
  onAppFeeCurrencyChange: (v: string) => void
  appFeeWaived: boolean
  setAppFeeWaived: (v: boolean) => void
  scholarship: boolean
  setScholarship: (v: boolean) => void
  scholarshipNote: string
  setScholarshipNote: (v: string) => void
}) {
  return (
    <div className={panelClass(p.hidden)}>
      <div className="grid grid-cols-3 gap-sm">
        <TextField
          label="Tuition fee"
          type="number"
          value={p.feeAmount}
          onChange={(e) => p.setFeeAmount(e.target.value)}
        />
        <SelectField
          label="Currency"
          id="course-currency"
          value={p.feeCurrency}
          onChange={(e) => p.setFeeCurrency(e.target.value)}
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
          value={p.feePeriod}
          onChange={(e) => p.setFeePeriod(e.target.value as 'per_year' | 'total')}
        >
          <option value="per_year">Per year</option>
          <option value="total">Total programme</option>
        </SelectField>
      </div>
      <div className="grid grid-cols-3 items-end gap-sm">
        <TextField
          label="Application fee"
          type="number"
          value={p.appFeeAmount}
          onChange={(e) => p.setAppFeeAmount(e.target.value)}
        />
        <SelectField
          label="Currency"
          id="app-fee-currency"
          value={p.effectiveAppFeeCurrency}
          onChange={(e) => p.onAppFeeCurrencyChange(e.target.value)}
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
            checked={p.appFeeWaived}
            onChange={(e) => p.setAppFeeWaived(e.target.checked)}
            className="h-4 w-4"
          />
          Application fee waived
        </label>
      </div>
      <label className="flex items-center gap-sm text-body-sm text-text-primary">
        <input
          type="checkbox"
          checked={p.scholarship}
          onChange={(e) => p.setScholarship(e.target.checked)}
          className="h-4 w-4"
        />
        Scholarship available
      </label>
      {p.scholarship && (
        <TextField
          label="Scholarship note"
          value={p.scholarshipNote ?? ''}
          onChange={(e) => p.setScholarshipNote(e.target.value)}
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

export function CourseRequirementsPanel(p: {
  hidden: boolean
  activeExams: Exam[]
  minScore: string
  setMinScore: (v: string) => void
  scheme: string
  setScheme: (v: 'percentage' | 'cgpa_10' | 'cgpa_4') => void
  maxBacklogs: string
  setMaxBacklogs: (v: string) => void
  workExpMonths: string
  setWorkExpMonths: (v: string) => void
  background: string
  setBackground: (v: string) => void
  english: EnglishReq[]
  setEnglish: React.Dispatch<React.SetStateAction<EnglishReq[]>>
  moiAccepted: boolean
  setMoiAccepted: (v: boolean) => void
  aptitude: AptitudeReq[]
  setAptitude: React.Dispatch<React.SetStateAction<AptitudeReq[]>>
  eligibility: string
  setEligibility: (v: string) => void
}) {
  return (
    <div className={panelClass(p.hidden)}>
      <p className="text-caption text-text-secondary">
        Every field is optional — an empty field means "no requirement", and only rules you fill in are ever checked
        against a student. Exams come from Catalog Settings.
      </p>
      <div className="grid grid-cols-4 gap-sm">
        <TextField
          label="Min academic score"
          type="number"
          value={p.minScore}
          onChange={(e) => p.setMinScore(e.target.value)}
        />
        <SelectField
          label="Scheme"
          id="req-scheme"
          value={p.scheme}
          onChange={(e) => p.setScheme(e.target.value as 'percentage' | 'cgpa_10' | 'cgpa_4')}
        >
          <option value="percentage">Percentage</option>
          <option value="cgpa_10">CGPA (10)</option>
          <option value="cgpa_4">CGPA (4)</option>
        </SelectField>
        <TextField
          label="Max backlogs"
          type="number"
          value={p.maxBacklogs}
          onChange={(e) => p.setMaxBacklogs(e.target.value)}
        />
        <TextField
          label="Min work exp (months)"
          type="number"
          value={p.workExpMonths}
          onChange={(e) => p.setWorkExpMonths(e.target.value)}
        />
      </div>
      <TextField
        label="Required background"
        value={p.background ?? ''}
        onChange={(e) => p.setBackground(e.target.value)}
        placeholder='e.g. "CS or related 4-year bachelor"'
      />
      <div className="flex flex-col gap-xs">
        <div className="flex items-center justify-between">
          <p className="text-body-sm font-medium text-text-primary">English requirements (any one test qualifies)</p>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => p.setEnglish((prev) => [...prev, { exam_id: '', min_overall: '', min_band: '' }])}
          >
            Add test
          </Button>
        </div>
        {p.english.map((row, i) => (
          <EnglishRequirementRow
            key={i}
            row={row}
            exams={p.activeExams}
            onChange={(patch) => p.setEnglish((prev) => prev.map((r, j) => (j === i ? { ...r, ...patch } : r)))}
            onRemove={() => p.setEnglish((prev) => prev.filter((_, j) => j !== i))}
          />
        ))}
        <label className="flex items-center gap-sm text-body-sm text-text-primary">
          <input
            type="checkbox"
            checked={p.moiAccepted}
            onChange={(e) => p.setMoiAccepted(e.target.checked)}
            className="h-4 w-4"
          />
          Medium of Instruction letter accepted in lieu of a test
        </label>
      </div>
      <div className="flex flex-col gap-xs">
        <div className="flex items-center justify-between">
          <p className="text-body-sm font-medium text-text-primary">Aptitude / entrance exams</p>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => p.setAptitude((prev) => [...prev, { exam_id: '', min_score: '', required: true }])}
          >
            Add exam
          </Button>
        </div>
        {p.aptitude.map((row, i) => (
          <AptitudeRequirementRow
            key={i}
            row={row}
            exams={p.activeExams}
            onChange={(patch) => p.setAptitude((prev) => prev.map((r, j) => (j === i ? { ...r, ...patch } : r)))}
            onRemove={() => p.setAptitude((prev) => prev.filter((_, j) => j !== i))}
          />
        ))}
      </div>
      <div className="flex flex-col gap-xs">
        <FieldLabel htmlFor="course-eligibility">
          Eligibility note (shown to students beside the structured checks)
        </FieldLabel>
        <textarea
          id="course-eligibility"
          value={p.eligibility}
          onChange={(e) => p.setEligibility(e.target.value)}
          rows={2}
          className={TEXTAREA_CLASS}
        />
      </div>
    </div>
  )
}

export function CourseFlagsPanel(p: {
  hidden: boolean
  studyMode: string
  setStudyMode: (v: string) => void
  delivery: string
  setDelivery: (v: string) => void
  coop: boolean
  setCoop: (v: boolean) => void
  psw: boolean
  setPsw: (v: boolean) => void
}) {
  return (
    <div className={panelClass(p.hidden)}>
      <div className="grid grid-cols-2 gap-sm">
        <SelectField
          label="Study mode"
          id="course-study-mode"
          value={p.studyMode ?? ''}
          onChange={(e) => p.setStudyMode(e.target.value)}
        >
          <option value="">Not specified</option>
          <option value="full_time">Full time</option>
          <option value="part_time">Part time</option>
        </SelectField>
        <SelectField
          label="Delivery"
          id="course-delivery"
          value={p.delivery ?? ''}
          onChange={(e) => p.setDelivery(e.target.value)}
        >
          <option value="">Not specified</option>
          <option value="on_campus">On campus</option>
          <option value="hybrid">Hybrid</option>
          <option value="online">Online</option>
        </SelectField>
      </div>
      <label className="flex items-center gap-sm text-body-sm text-text-primary">
        <input type="checkbox" checked={p.coop} onChange={(e) => p.setCoop(e.target.checked)} className="h-4 w-4" />
        Co-op / internship available
      </label>
      <label className="flex items-center gap-sm text-body-sm text-text-primary">
        <input type="checkbox" checked={p.psw} onChange={(e) => p.setPsw(e.target.checked)} className="h-4 w-4" />
        Post-study work eligible
      </label>
    </div>
  )
}
