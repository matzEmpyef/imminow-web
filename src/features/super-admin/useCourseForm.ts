import { useEffect, useState } from 'react'
import type { components } from '@/api/schema'
import { useCountrySettings } from '@/queries/countries'
import {
  type AptitudeReq,
  type EnglishReq,
  type EntryQualificationValue,
  type FeePeriodValue,
  type FormTab,
  type IntakeStatus,
  type ScoreSchemeValue,
} from './courseFormShared'

type College = components['schemas']['College']
type Course = components['schemas']['Course']
type CourseInput = components['schemas']['CourseInput']

// Everything CourseFormModal's five tab panels need — state and the handlers that mutate it —
// as ONE typed object, replacing the 18-prop bag (name/setName, description/setDescription, ...)
// each panel used to take individually (audit item 6, 2026-09-01, "the same treatment CourseFinder
// got": see courseFinderState.ts's useCourseFinderState). `college` and `activeExams` stay OUTSIDE
// this object and are passed to the panels separately — they're external read-only data (the
// college's own campus list, the active exams catalog), not form state this hook owns.
export interface CourseFormValue {
  // Basics
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
  courseUrl: string
  setCourseUrl: (v: string) => void
  language: string
  setLanguage: (v: string) => void
  benefits: string
  setBenefits: (v: string) => void

  // Campuses & Intakes
  campusIds: string[]
  onToggleCampus: (id: string) => void
  allSelected: boolean
  onToggleAll: () => void
  intakes: string[]
  setIntakes: (v: string[]) => void
  deadlines: Record<string, { deadline: string; status: IntakeStatus }>
  onDeadlineChange: (month: string, patch: Partial<{ deadline: string; status: IntakeStatus }>) => void
  /** Months whose saved deadline the server rolled forward rather than a college confirming (C10). */
  rolledMonths: ReadonlySet<string>

  // Fees
  feeAmount: string
  setFeeAmount: (v: string) => void
  feeCurrency: string
  setFeeCurrency: (v: string) => void
  feePeriod: FeePeriodValue
  setFeePeriod: (v: FeePeriodValue) => void
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

  // Entry Requirements
  entryQualification: EntryQualificationValue
  setEntryQualification: (v: EntryQualificationValue) => void
  minScore: string
  setMinScore: (v: string) => void
  scheme: ScoreSchemeValue
  setScheme: (v: ScoreSchemeValue) => void
  maxBacklogs: string
  setMaxBacklogs: (v: string) => void
  workExpMonths: string
  setWorkExpMonths: (v: string) => void
  background: string
  setBackground: (v: string) => void
  english: EnglishReq[]
  onAddEnglish: () => void
  onChangeEnglish: (index: number, patch: Partial<EnglishReq>) => void
  onRemoveEnglish: (index: number) => void
  moiAccepted: boolean
  setMoiAccepted: (v: boolean) => void
  aptitude: AptitudeReq[]
  onAddAptitude: () => void
  onChangeAptitude: (index: number, patch: Partial<AptitudeReq>) => void
  onRemoveAptitude: (index: number) => void
  eligibility: string
  setEligibility: (v: string) => void

  // Flags
  studyMode: string
  setStudyMode: (v: string) => void
  delivery: string
  setDelivery: (v: string) => void
  coop: boolean
  setCoop: (v: boolean) => void
  psw: boolean
  setPsw: (v: boolean) => void

  // Meta
  activeTab: FormTab
  setActiveTab: (tab: FormTab) => void
  // Mirrors handleSubmit's own `if (!name || !language) return` gate exactly.
  isValid: boolean
  // True when the college has an active campus and none is picked — the Campuses & Intakes tab's
  // own inline "Pick at least one campus" error (review C7, 2026-09-12).
  campusRequired: boolean
  /**
   * The four answers the form now refuses to guess (assumptions audit C1/C3/C5, approved
   * 2026-09-19), each as the message its own field shows and `isValid` blocks on. Undefined when
   * the field is fine. They are errors rather than silent defaults because every one of them
   * used to be filled in by the code and then saved as though an admin had said it.
   */
  entryQualificationError?: string
  schemeError?: string
  feeCurrencyError?: string
  feePeriodError?: string
  appFeeCurrencyError?: string
  toPayload: () => Omit<CourseInput, 'college_id' | 'active'>
}

/**
 * The course create/edit form's whole client-side state machine — extracted out of
 * CollegeDetailPage.tsx's CourseFormModal (audit item 6, 2026-09-01: it carried ~30 useState
 * calls and passed an 18-prop value/setter bag to each of its five tab panels). Pure state +
 * derived validity + a toPayload() builder; CourseFormModal still owns the query hooks
 * (useCreateCourse/useUpdateCourse) and the actual mutate() call, same as useCourseFinderState
 * leaves the query itself to CourseFinderPage.
 *
 * `college` is needed only to compute the campus toggle's "all campuses" derived state
 * (allSelected/onToggleAll) against the college's current campus list.
 */
export function useCourseForm(college: College, editingCourse?: Course, defaultCampusId?: string): CourseFormValue {
  const [activeTab, setActiveTab] = useState<FormTab>('Basics')

  // Basics
  const [name, setName] = useState(editingCourse?.name ?? '')
  const [description, setDescription] = useState(editingCourse?.description ?? '')
  // The level no longer carries an entry-qualification pre-fill with it (assumptions audit C1,
  // approved 2026-09-19) — the qualification is the admin's answer or "Not set", never derived.
  const [level, setLevel] = useState(editingCourse?.level ?? '')
  const [fieldOfStudy, setFieldOfStudy] = useState(editingCourse?.field_of_study ?? '')
  const [duration, setDuration] = useState(editingCourse?.duration ?? '')
  const [durationMonths, setDurationMonths] = useState(
    editingCourse?.duration_months != null ? String(editingCourse.duration_months) : '',
  )
  const [credentials, setCredentials] = useState(editingCourse?.credentials ?? '')
  const [courseUrl, setCourseUrl] = useState(editingCourse?.course_url ?? '')
  const [language, setLanguage] = useState(editingCourse?.language ?? '')
  const [benefits, setBenefits] = useState(editingCourse?.benefits ?? '')

  // Campuses & Intakes
  // A course is only ever found through a campus, so a new one needs a starting answer (review
  // C7, 2026-09-12): with exactly one active campus there's nothing to actually choose, so it's
  // pre-selected; with several the admin must pick (see `campusRequired` below) rather than
  // silently defaulting to all or none of them.
  const activeCampuses = (college.campuses ?? []).filter((c) => c.active !== false)
  const [campusIds, setCampusIds] = useState<string[]>(
    editingCourse?.campus_ids ?? (defaultCampusId ? [defaultCampusId] : activeCampuses.length === 1 ? [activeCampuses[0].id!] : []),
  )
  const [intakes, setIntakes] = useState<string[]>(editingCourse?.intakes ?? [])
  // Three-valued since the assumptions audit (C10, approved 2026-09-19). A saved `open`/`closed`
  // loads as itself; anything else — `unknown`, or a legacy row with no status at all — loads as
  // Not set rather than being read as Open, which is how nine ticked months became nine intakes
  // advertised as taking applications.
  const [deadlines, setDeadlines] = useState<Record<string, { deadline: string; status: IntakeStatus }>>(() =>
    Object.fromEntries(
      (editingCourse?.intake_deadlines ?? []).map((d) => [
        d.month,
        {
          deadline: d.application_deadline ?? '',
          status: (d.status === 'open' || d.status === 'closed' ? d.status : 'unknown') as IntakeStatus,
        },
      ]),
    ),
  )
  // Read-only: the server sets `rolled` when it carried a passed deadline forward a year, and the
  // table says so beside the date instead of presenting an estimate as the college's own (C10).
  const rolledMonths = new Set((editingCourse?.intake_deadlines ?? []).filter((d) => d.rolled).map((d) => d.month))

  // Fees
  const [feeAmount, setFeeAmount] = useState(editingCourse?.fee?.amount != null ? String(editingCourse.fee.amount) : '')
  // Starts EMPTY, never INR (assumptions audit C5, approved 2026-09-19): a UK course priced
  // before its campus was picked was saved as INR 28,000 and read as a bargain in every filter.
  // An amount with no currency now blocks the save instead. The campus-country fill below stays,
  // but only as a suggestion into an empty field.
  const [feeCurrency, setFeeCurrencyRaw] = useState(editingCourse?.fee?.currency ?? '')
  // Only a NEW course's currency is auto-set; editing an existing one never overrides what was
  // actually saved. "Touched" also covers picking it manually, so a deliberate choice always wins
  // over the campus-country guess below.
  const [feeCurrencyTouched, setFeeCurrencyTouched] = useState(Boolean(editingCourse?.fee?.currency))
  function setFeeCurrency(v: string) {
    setFeeCurrencyRaw(v)
    setFeeCurrencyTouched(true)
  }
  // Was hardcoded to INR with no field at all (audit, 2026-08-23) — a college in Toronto charged
  // its application fee in rupees. Defaults to the course's own currency rather than to INR,
  // because the two almost always match, and tracks it until explicitly overridden so a Canadian
  // college does not need the same answer typed twice.
  const [appFeeCurrency, setAppFeeCurrency] = useState(
    editingCourse?.application_fee?.currency ?? editingCourse?.fee?.currency ?? '',
  )
  // Tracking stops the moment a saved course actually HAS an application-fee currency
  // (assumptions audit C5/H16, approved 2026-09-19). It used to keep tracking whenever the two
  // matched, so correcting tuition CAD→USD silently rewrote an application fee the college still
  // charges in CAD. A persisted answer is an answer, even when it happens to equal the tuition's.
  const [appFeeCurrencyTouched, setAppFeeCurrencyTouched] = useState(
    Boolean(editingCourse?.application_fee?.currency),
  )
  const effectiveAppFeeCurrency = appFeeCurrencyTouched ? appFeeCurrency : feeCurrency
  // No pre-selection (assumptions audit H16, approved 2026-09-19) — see FeePeriodValue. An
  // existing course keeps whatever was saved; a course saved before this field existed comes back
  // blank and has to be answered the next time the fee is touched.
  const [feePeriod, setFeePeriod] = useState<FeePeriodValue>(editingCourse?.fee_period ?? '')
  const [appFeeAmount, setAppFeeAmount] = useState(
    editingCourse?.application_fee?.amount != null ? String(editingCourse.application_fee.amount) : '',
  )
  const [appFeeWaived, setAppFeeWaived] = useState(editingCourse?.application_fee_waived ?? false)
  const [scholarship, setScholarship] = useState(editingCourse?.scholarship_available ?? false)
  const [scholarshipNote, setScholarshipNote] = useState(editingCourse?.scholarship_note ?? '')

  // Entry Requirements — every field optional by design: an empty field means "no requirement",
  // never "unknown" (plan §1.2), so a half-filled tab is a perfectly valid save.
  const existingReqs = editingCourse?.requirements
  // The ONE qualification the minimum score is measured on (user, 2026-09-17: "instead of
  // assuming, a field with drop down to select the entry requirement"). Starts at "Not set" and
  // is never derived from the course level (assumptions audit C1, approved 2026-09-19): the
  // pre-fill was saved as though an admin had chosen it, so a Diploma or PhD course measured
  // everyone against the 12th and a 10th-standard 92 % satisfied a PhD minimum.
  const [entryQualification, setEntryQualification] = useState<EntryQualificationValue>(
    existingReqs?.academic?.entry_qualification ?? '',
  )
  const [minScore, setMinScore] = useState(
    existingReqs?.academic?.min_score != null ? String(existingReqs.academic.min_score) : '',
  )
  // No pre-selected Percentage either (assumptions audit C3): `3.5` typed from a 4-point GPA was
  // saved as a 3.5 % floor that every applicant clears.
  const [scheme, setScheme] = useState<ScoreSchemeValue>(existingReqs?.academic?.scheme ?? '')
  const [background, setBackground] = useState(existingReqs?.academic?.required_background ?? '')
  const [maxBacklogs, setMaxBacklogs] = useState(
    existingReqs?.academic?.max_backlogs != null ? String(existingReqs.academic.max_backlogs) : '',
  )
  const [english, setEnglish] = useState<EnglishReq[]>(
    (existingReqs?.english ?? []).map((e) => ({
      exam_id: e.exam_id ?? '',
      min_overall: String(e.min_overall ?? ''),
      min_band: e.min_band != null ? String(e.min_band) : '',
    })),
  )
  const [moiAccepted, setMoiAccepted] = useState(existingReqs?.moi_accepted ?? false)
  const [aptitude, setAptitude] = useState<AptitudeReq[]>(
    (existingReqs?.aptitude ?? []).map((a) => ({
      exam_id: a.exam_id ?? '',
      min_score: String(a.min_score ?? ''),
      required: a.required !== false,
    })),
  )
  const [workExpMonths, setWorkExpMonths] = useState(
    existingReqs?.min_work_experience_months != null ? String(existingReqs.min_work_experience_months) : '',
  )
  const [eligibility, setEligibility] = useState(editingCourse?.eligibility ?? '')

  // Flags
  const [studyMode, setStudyMode] = useState(editingCourse?.study_mode ?? '')
  const [delivery, setDelivery] = useState(editingCourse?.delivery ?? '')
  const [coop, setCoop] = useState(editingCourse?.coop_available ?? false)
  const [psw, setPsw] = useState(editingCourse?.post_study_work_eligible ?? false)

  // Default the fee currency from the campus's country when adding a course (product review,
  // 2026-09-12) — INR-by-default meant a Toronto course started life priced in rupees until
  // someone remembered to change it. Only runs until the admin touches the currency themselves or
  // saves it, and only while adding — never overrides an existing course's saved currency.
  const countrySettings = useCountrySettings()
  useEffect(() => {
    if (feeCurrencyTouched || campusIds.length === 0) return
    const campus = (college.campuses ?? []).find((c) => c.id === campusIds[0])
    const setting = campus && countrySettings.data?.find((s) => s.name === campus.country)
    if (setting?.default_currency) setFeeCurrencyRaw(setting.default_currency)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- college.campuses is stable for the life of this form
  }, [campusIds, countrySettings.data, feeCurrencyTouched])

  const allCampusIds = (college.campuses ?? []).map((c) => c.id!)
  const allSelected = allCampusIds.length > 0 && allCampusIds.every((id) => campusIds.includes(id))
  // Mirrors the server's own campus capture check (COURSE_CAPTURE_CHECKS, mock-server/server.js)
  // client-side, so the gap is caught before submit rather than only as a 400 back from it. A
  // college with no active campuses at all has nothing to require here — same "empty is fine"
  // convention every other capture check on this form already follows.
  const campusRequired = activeCampuses.length > 0 && campusIds.length === 0

  // The answers the form used to supply for the admin, now refused (assumptions audit C1/C3/C5,
  // approved 2026-09-19). Each mirrors a check the server makes too, so the gap is caught before
  // submit rather than only as a 400 back from it — same convention `campusRequired` follows.
  const entryQualificationError =
    minScore !== '' && entryQualification === ''
      ? 'Pick the qualification this score is measured on — a score on its own is checked against the wrong level.'
      : undefined
  const schemeError =
    minScore !== '' && scheme === ''
      ? 'Say how this score is scored — 8.5 read as a percentage instead of a CGPA fails everyone.'
      : undefined
  const feeCurrencyError =
    feeAmount !== '' && feeCurrency === '' ? 'Pick the currency this fee is in.' : undefined
  // Asked only alongside an amount, like the currency above: with no tuition figure there is
  // nothing for a period to describe (assumptions audit H16, approved 2026-09-19).
  const feePeriodError =
    feeAmount !== '' && feePeriod === ''
      ? 'Say what this fee covers — a per-programme figure read as per-year doubles a two-year course.'
      : undefined
  const appFeeCurrencyError =
    appFeeAmount !== '' && !appFeeWaived && effectiveAppFeeCurrency === ''
      ? 'Pick the currency this application fee is in.'
      : undefined

  function toggleCampus(id: string) {
    setCampusIds((prev) => (prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id]))
  }

  function buildRequirements(): CourseInput['requirements'] {
    const englishRows = english
      .filter((e) => e.exam_id && e.min_overall !== '')
      .map((e) => ({
        exam_id: e.exam_id,
        min_overall: Number(e.min_overall),
        min_band: e.min_band === '' ? null : Number(e.min_band),
      }))
    const aptitudeRows = aptitude
      .filter((a) => a.exam_id && a.min_score !== '')
      .map((a) => ({ exam_id: a.exam_id, min_score: Number(a.min_score), required: a.required }))
    // `entry_qualification` is written whenever it is SET, not only alongside a score
    // (assumptions audit C1/H16, approved 2026-09-19) — "Diploma + 2 backlogs, no score" used to
    // discard the qualification the admin had just chosen, because it only ever travelled inside
    // the min-score branch. The score and its scheme still travel together: a score without its
    // scale is the CGPA-as-percentage bug (C3), and the server refuses it.
    const academic =
      minScore !== '' || background || maxBacklogs !== '' || entryQualification !== ''
        ? {
            ...(entryQualification !== '' ? { entry_qualification: entryQualification } : {}),
            ...(minScore !== '' && scheme !== '' ? { min_score: Number(minScore), scheme } : {}),
            ...(background ? { required_background: background } : {}),
            ...(maxBacklogs !== '' ? { max_backlogs: Number(maxBacklogs) } : {}),
          }
        : null
    if (!academic && englishRows.length === 0 && aptitudeRows.length === 0 && !moiAccepted && workExpMonths === '') {
      return null
    }
    return {
      academic,
      english: englishRows,
      moi_accepted: moiAccepted,
      aptitude: aptitudeRows,
      min_work_experience_months: workExpMonths === '' ? null : Number(workExpMonths),
    }
  }

  function toPayload(): Omit<CourseInput, 'college_id' | 'active'> {
    return {
      name,
      description,
      level,
      field_of_study: fieldOfStudy,
      duration,
      duration_months: durationMonths === '' ? null : Number(durationMonths),
      fee: feeAmount ? { amount: Number(feeAmount), currency: feeCurrency } : null,
      fee_period: feePeriod || null,
      application_fee: appFeeAmount ? { amount: Number(appFeeAmount), currency: effectiveAppFeeCurrency } : null,
      application_fee_waived: appFeeWaived,
      scholarship_available: scholarship,
      scholarship_note: scholarship && scholarshipNote ? scholarshipNote : null,
      // A month nobody has answered for saves as `unknown`, not `open` (C10) — the app shows no
      // "applications open" badge for it rather than advertising an intake on a guess.
      intake_deadlines: intakes.map((month) => ({
        month,
        application_deadline: deadlines[month]?.deadline || null,
        status: deadlines[month]?.status ?? ('unknown' as const),
      })),
      study_mode: (studyMode || null) as CourseInput['study_mode'],
      delivery: (delivery || null) as CourseInput['delivery'],
      coop_available: coop,
      post_study_work_eligible: psw,
      requirements: buildRequirements(),
      benefits,
      eligibility,
      intakes,
      credentials,
      course_url: courseUrl.trim() || null,
      language,
      campus_ids: campusIds,
    }
  }

  return {
    name,
    setName,
    description,
    setDescription,
    level,
    setLevel,
    fieldOfStudy,
    setFieldOfStudy,
    duration,
    setDuration,
    durationMonths,
    setDurationMonths,
    credentials,
    setCredentials,
    courseUrl,
    setCourseUrl,
    language,
    setLanguage,
    benefits,
    setBenefits,

    campusIds,
    onToggleCampus: toggleCampus,
    allSelected,
    onToggleAll: () => setCampusIds(allSelected ? [] : allCampusIds),
    intakes,
    setIntakes,
    deadlines,
    // A month ticked for the first time starts at Not set, never Open (C10).
    onDeadlineChange: (month, patch) =>
      setDeadlines((prev) => ({
        ...prev,
        [month]: { deadline: prev[month]?.deadline ?? '', status: prev[month]?.status ?? 'unknown', ...patch },
      })),
    rolledMonths,

    feeAmount,
    setFeeAmount,
    feeCurrency,
    setFeeCurrency,
    feePeriod,
    setFeePeriod,
    appFeeAmount,
    setAppFeeAmount,
    effectiveAppFeeCurrency,
    onAppFeeCurrencyChange: (value) => {
      setAppFeeCurrency(value)
      setAppFeeCurrencyTouched(true)
    },
    appFeeWaived,
    setAppFeeWaived,
    scholarship,
    setScholarship,
    scholarshipNote,
    setScholarshipNote,

    entryQualification,
    setEntryQualification,
    minScore,
    setMinScore,
    scheme,
    setScheme,
    maxBacklogs,
    setMaxBacklogs,
    workExpMonths,
    setWorkExpMonths,
    background,
    setBackground,
    english,
    onAddEnglish: () => setEnglish((prev) => [...prev, { exam_id: '', min_overall: '', min_band: '' }]),
    onChangeEnglish: (index, patch) => setEnglish((prev) => prev.map((r, j) => (j === index ? { ...r, ...patch } : r))),
    onRemoveEnglish: (index) => setEnglish((prev) => prev.filter((_, j) => j !== index)),
    moiAccepted,
    setMoiAccepted,
    aptitude,
    onAddAptitude: () => setAptitude((prev) => [...prev, { exam_id: '', min_score: '', required: true }]),
    onChangeAptitude: (index, patch) =>
      setAptitude((prev) => prev.map((r, j) => (j === index ? { ...r, ...patch } : r))),
    onRemoveAptitude: (index) => setAptitude((prev) => prev.filter((_, j) => j !== index)),
    eligibility,
    setEligibility,

    studyMode,
    setStudyMode,
    delivery,
    setDelivery,
    coop,
    setCoop,
    psw,
    setPsw,

    activeTab,
    setActiveTab,
    // Level, field of study and delivery join name and language as required (user, 2026-09-17):
    // all three are facets students filter by, so a course without them cannot be found.
    isValid:
      Boolean(name && language && level && fieldOfStudy && delivery) &&
      !campusRequired &&
      !entryQualificationError &&
      !schemeError &&
      !feeCurrencyError &&
      !feePeriodError &&
      !appFeeCurrencyError,
    campusRequired,
    entryQualificationError,
    schemeError,
    feeCurrencyError,
    feePeriodError,
    appFeeCurrencyError,
    toPayload,
  }
}
