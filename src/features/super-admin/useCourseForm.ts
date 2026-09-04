import { useState } from 'react'
import type { components } from '@/api/schema'
import { type AptitudeReq, type EnglishReq, type FormTab } from './courseFormShared'

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
  deadlines: Record<string, { deadline: string; open: boolean }>
  onDeadlineChange: (month: string, patch: Partial<{ deadline: string; open: boolean }>) => void

  // Fees
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

  // Entry Requirements
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
  const [campusIds, setCampusIds] = useState<string[]>(
    editingCourse?.campus_ids ?? (defaultCampusId ? [defaultCampusId] : []),
  )
  const [intakes, setIntakes] = useState<string[]>(editingCourse?.intakes ?? [])
  const [deadlines, setDeadlines] = useState<Record<string, { deadline: string; open: boolean }>>(() =>
    Object.fromEntries(
      (editingCourse?.intake_deadlines ?? []).map((d) => [
        d.month,
        { deadline: d.application_deadline ?? '', open: d.status !== 'closed' },
      ]),
    ),
  )

  // Fees
  const [feeAmount, setFeeAmount] = useState(editingCourse?.fee?.amount != null ? String(editingCourse.fee.amount) : '')
  const [feeCurrency, setFeeCurrency] = useState(editingCourse?.fee?.currency ?? 'INR')
  // Was hardcoded to INR with no field at all (audit, 2026-08-23) — a college in Toronto charged
  // its application fee in rupees. Defaults to the course's own currency rather than to INR,
  // because the two almost always match, and tracks it until explicitly overridden so a Canadian
  // college does not need the same answer typed twice.
  const [appFeeCurrency, setAppFeeCurrency] = useState(
    editingCourse?.application_fee?.currency ?? editingCourse?.fee?.currency ?? 'INR',
  )
  const [appFeeCurrencyTouched, setAppFeeCurrencyTouched] = useState(
    Boolean(editingCourse?.application_fee?.currency) &&
      editingCourse?.application_fee?.currency !== editingCourse?.fee?.currency,
  )
  const effectiveAppFeeCurrency = appFeeCurrencyTouched ? appFeeCurrency : feeCurrency
  const [feePeriod, setFeePeriod] = useState<'per_year' | 'total'>(editingCourse?.fee_period ?? 'per_year')
  const [appFeeAmount, setAppFeeAmount] = useState(
    editingCourse?.application_fee?.amount != null ? String(editingCourse.application_fee.amount) : '',
  )
  const [appFeeWaived, setAppFeeWaived] = useState(editingCourse?.application_fee_waived ?? false)
  const [scholarship, setScholarship] = useState(editingCourse?.scholarship_available ?? false)
  const [scholarshipNote, setScholarshipNote] = useState(editingCourse?.scholarship_note ?? '')

  // Entry Requirements — every field optional by design: an empty field means "no requirement",
  // never "unknown" (plan §1.2), so a half-filled tab is a perfectly valid save.
  const existingReqs = editingCourse?.requirements
  const [minScore, setMinScore] = useState(
    existingReqs?.academic?.min_score != null ? String(existingReqs.academic.min_score) : '',
  )
  const [scheme, setScheme] = useState(existingReqs?.academic?.scheme ?? 'percentage')
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

  const allCampusIds = (college.campuses ?? []).map((c) => c.id!)
  const allSelected = allCampusIds.length > 0 && allCampusIds.every((id) => campusIds.includes(id))

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
    const academic =
      minScore !== '' || background || maxBacklogs !== ''
        ? {
            ...(minScore !== '' ? { min_score: Number(minScore), scheme } : {}),
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
      fee_period: feePeriod,
      application_fee: appFeeAmount ? { amount: Number(appFeeAmount), currency: effectiveAppFeeCurrency } : null,
      application_fee_waived: appFeeWaived,
      scholarship_available: scholarship,
      scholarship_note: scholarship && scholarshipNote ? scholarshipNote : null,
      intake_deadlines: intakes.map((month) => ({
        month,
        application_deadline: deadlines[month]?.deadline || null,
        status: (deadlines[month]?.open ?? true) ? ('open' as const) : ('closed' as const),
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
    onDeadlineChange: (month, patch) =>
      setDeadlines((prev) => ({
        ...prev,
        [month]: { deadline: prev[month]?.deadline ?? '', open: prev[month]?.open ?? true, ...patch },
      })),

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
    isValid: Boolean(name && language),
    toPayload,
  }
}
