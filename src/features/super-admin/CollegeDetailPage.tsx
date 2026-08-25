import { useState, type FormEvent } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, Pencil } from 'lucide-react'
import { AdminShell } from '@/features/auth/AdminShell'
import { SelectField } from '@/components/SelectField'
import { Card } from '@/components/Card'
import { ErrorState, Skeleton } from '@/components/QueryState'
import { Button } from '@/components/Button'
import { Badge } from '@/components/Badge'
import { TextField } from '@/components/TextField'
import { CountrySelect } from '@/components/CountrySelect'
import { FieldLabel } from '@/components/FieldLabel'
import { Toggle } from '@/components/Toggle'
import { Modal } from '@/components/Modal'
import { ImageUploadField } from '@/components/ImageUploadField'
import { Table, type TableColumn } from '@/components/Table'
import { useCollegeDetail, useCreateCampus, useUpdateCampus, useUpdateCollege } from '@/queries/adminColleges'
import { useCourses, useCreateCourse, useUpdateCourse } from '@/queries/courseSuggestions'
import { useExams } from '@/queries/catalogSettings'
import { useCursorPagination } from '@/lib/pagination'
import { FORM_TABS, courseCompleteness, type AptitudeReq, type EnglishReq, type FormTab } from './courseFormShared'
import {
  CourseBasicsPanel,
  CourseCampusIntakesPanel,
  CourseFeesPanel,
  CourseFlagsPanel,
  CourseRequirementsPanel,
} from './CourseFormPanels'
import type { components } from '@/api/schema'

type College = components['schemas']['College']
type Campus = components['schemas']['Campus']
type Course = components['schemas']['Course']

function CollegeFormModal({ college, onClose }: { college: College; onClose: () => void }) {
  const updateCollege = useUpdateCollege(college.id!)
  const [name, setName] = useState(college.name ?? '')
  const [logoUrl, setLogoUrl] = useState(college.logo_url ?? '')
  const [website, setWebsite] = useState(college.website ?? '')
  const [description, setDescription] = useState(college.description ?? '')
  const [qsRank, setQsRank] = useState(college.qs_rank != null ? String(college.qs_rank) : '')
  const [theRank, setTheRank] = useState(college.the_rank != null ? String(college.the_rank) : '')
  const [institutionType, setInstitutionType] = useState(college.institution_type ?? '')

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!name) return
    updateCollege.mutate(
      {
        name,
        logo_url: logoUrl || null,
        website: website || null,
        description,
        qs_rank: qsRank === '' ? null : Number(qsRank),
        the_rank: theRank === '' ? null : Number(theRank),
        institution_type: (institutionType || null) as College['institution_type'],
      },
      { onSuccess: () => onClose() },
    )
  }

  return (
    <Modal
      onClose={onClose}
      title="Edit College"
      widthRem={28}
      footer={
        <>
          {updateCollege.isError && (
            <p className="mr-auto self-center text-body-sm text-error">{updateCollege.error.message}</p>
          )}
          <Button type="submit" form="edit-college-form" loading={updateCollege.isPending} disabled={!name}>
            Save Changes
          </Button>
        </>
      }
    >
      <form id="edit-college-form" onSubmit={handleSubmit} className="flex flex-col gap-md">
        <TextField label="College name" required value={name} onChange={(e) => setName(e.target.value)} />
        <ImageUploadField
          label="Logo"
          value={logoUrl ?? ''}
          onChange={setLogoUrl}
          hint="Square — shown as a 56×56 circle in the app. Ideal size 200×200px."
        />
        <TextField label="Website" value={website ?? ''} onChange={(e) => setWebsite(e.target.value)} />
        <div className="grid grid-cols-3 gap-sm">
          <TextField label="QS rank" type="number" value={qsRank} onChange={(e) => setQsRank(e.target.value)} />
          <TextField label="THE rank" type="number" value={theRank} onChange={(e) => setTheRank(e.target.value)} />
          <SelectField
            label="Type"
            id="college-type"
            value={institutionType ?? ''}
            onChange={(e) => setInstitutionType(e.target.value)}
          >
            <option value="">Not specified</option>
            <option value="university">University</option>
            <option value="college">College</option>
            <option value="institute">Institute</option>
          </SelectField>
        </div>
        <div className="flex flex-col gap-xs">
          <FieldLabel htmlFor="college-description">Description</FieldLabel>
          <textarea
            id="college-description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            className="rounded-md border border-border bg-surface p-sm text-body text-text-primary"
          />
        </div>
      </form>
    </Modal>
  )
}

function CampusFormModal({
  collegeId,
  editingCampus,
  onClose,
}: {
  collegeId: string
  editingCampus?: Campus
  onClose: () => void
}) {
  const isEditing = Boolean(editingCampus)
  const createCampus = useCreateCampus(collegeId)
  const updateCampus = useUpdateCampus(collegeId)
  const [provinceState, setProvinceState] = useState(editingCampus?.province_state ?? '')
  const [city, setCity] = useState(editingCampus?.city ?? '')
  const [country, setCountry] = useState(editingCampus?.country ?? '')

  const mutation = isEditing ? updateCampus : createCampus

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!provinceState || !country) return
    const body = { province_state: provinceState, city: city || null, country }
    if (editingCampus) {
      updateCampus.mutate({ campusId: editingCampus.id!, body }, { onSuccess: () => onClose() })
    } else {
      createCampus.mutate(body, { onSuccess: () => onClose() })
    }
  }

  return (
    <Modal
      onClose={onClose}
      title={isEditing ? 'Edit Campus' : 'Add Campus'}
      widthRem={26}
      footer={
        <>
          {mutation.isError && <p className="mr-auto self-center text-body-sm text-error">{mutation.error.message}</p>}
          <Button
            type="submit"
            form="campus-form"
            variant="secondary"
            loading={mutation.isPending}
            disabled={!provinceState || !country}
          >
            {isEditing ? 'Save Changes' : 'Add Campus'}
          </Button>
        </>
      }
    >
      <form id="campus-form" onSubmit={handleSubmit} className="flex flex-col gap-md">
        <TextField
          label="City"
          value={city ?? ''}
          onChange={(e) => setCity(e.target.value)}
          placeholder="e.g. Toronto"
        />
        <TextField
          label="Province/State"
          required
          value={provinceState}
          onChange={(e) => setProvinceState(e.target.value)}
        />
        <CountrySelect label="Country" required value={country} onChange={setCountry} />
      </form>
    </Modal>
  )
}

// The "all campuses" checkbox is a UI shortcut over `campus_ids`, not a stored flag (erd.md's
// `course_campuses` join table note) — checking it just selects every one of the college's
// current campus IDs; it isn't remembered as "all," so a campus added later isn't automatically
// included until this box is re-checked.
function CourseFormModal({
  college,
  editingCourse,
  defaultCampusId,
  onClose,
}: {
  college: College
  editingCourse?: Course
  defaultCampusId?: string
  onClose: () => void
}) {
  const isEditing = Boolean(editingCourse)
  const createCourse = useCreateCourse()
  const updateCourse = useUpdateCourse(editingCourse?.id ?? '')
  const examsCatalog = useExams()
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

  const mutation = isEditing ? updateCourse : createCourse
  const allCampusIds = (college.campuses ?? []).map((c) => c.id!)
  const allSelected = allCampusIds.length > 0 && allCampusIds.every((id) => campusIds.includes(id))
  const activeExams = (examsCatalog.data ?? []).filter((e) => e.active !== false)

  function toggleCampus(id: string) {
    setCampusIds((prev) => (prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id]))
  }

  function buildRequirements() {
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

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!name || !language) return
    const body = {
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
      study_mode: (studyMode || null) as Course['study_mode'],
      delivery: (delivery || null) as Course['delivery'],
      coop_available: coop,
      post_study_work_eligible: psw,
      requirements: buildRequirements(),
      benefits,
      eligibility,
      intakes,
      credentials,
      language,
      campus_ids: campusIds,
    }
    if (isEditing) {
      updateCourse.mutate(body, { onSuccess: () => onClose() })
    } else {
      createCourse.mutate({ ...body, college_id: college.id!, active: true }, { onSuccess: () => onClose() })
    }
  }

  return (
    <Modal
      onClose={onClose}
      title={isEditing ? 'Edit Course' : 'Add Course'}
      widthRem={46}
      footer={
        <>
          {mutation.isError && <p className="mr-auto self-center text-body-sm text-error">{mutation.error.message}</p>}
          {!language && (
            <p className="mr-auto self-center text-body-sm text-text-secondary">
              Language of teaching is required (Basics tab).
            </p>
          )}
          <Button type="submit" form="course-form" loading={mutation.isPending} disabled={!name || !language}>
            {isEditing ? 'Save Changes' : 'Create Course'}
          </Button>
        </>
      }
    >
      <div className="mb-md flex gap-xs border-b border-border">
        {FORM_TABS.map((tab) => (
          <button
            key={tab}
            type="button"
            onClick={() => setActiveTab(tab)}
            className={`whitespace-nowrap border-b-2 px-sm py-sm text-body-sm font-medium ${
              activeTab === tab
                ? 'border-primary text-primary'
                : 'border-transparent text-text-secondary hover:text-text-primary'
            }`}
          >
            {tab}
          </button>
        ))}
      </div>
      <form id="course-form" onSubmit={handleSubmit} className="flex flex-col gap-md">
        {/* All five panels stay mounted and toggle via the hidden class — conditional mounting
            would throw away in-progress state in the other tabs. See CourseFormPanels.tsx. */}
        <CourseBasicsPanel
          hidden={activeTab !== 'Basics'}
          name={name}
          setName={setName}
          description={description}
          setDescription={setDescription}
          level={level}
          setLevel={setLevel}
          fieldOfStudy={fieldOfStudy}
          setFieldOfStudy={setFieldOfStudy}
          duration={duration}
          setDuration={setDuration}
          durationMonths={durationMonths}
          setDurationMonths={setDurationMonths}
          credentials={credentials}
          setCredentials={setCredentials}
          language={language}
          setLanguage={setLanguage}
          benefits={benefits}
          setBenefits={setBenefits}
        />
        <CourseCampusIntakesPanel
          hidden={activeTab !== 'Campuses & Intakes'}
          college={college}
          campusIds={campusIds}
          onToggleCampus={toggleCampus}
          allSelected={allSelected}
          onToggleAll={() => setCampusIds(allSelected ? [] : allCampusIds)}
          intakes={intakes}
          setIntakes={setIntakes}
          deadlines={deadlines}
          setDeadlines={setDeadlines}
        />
        <CourseFeesPanel
          hidden={activeTab !== 'Fees'}
          feeAmount={feeAmount}
          setFeeAmount={setFeeAmount}
          feeCurrency={feeCurrency}
          setFeeCurrency={setFeeCurrency}
          feePeriod={feePeriod}
          setFeePeriod={setFeePeriod}
          appFeeAmount={appFeeAmount}
          setAppFeeAmount={setAppFeeAmount}
          effectiveAppFeeCurrency={effectiveAppFeeCurrency}
          onAppFeeCurrencyChange={(value) => {
            setAppFeeCurrency(value)
            setAppFeeCurrencyTouched(true)
          }}
          appFeeWaived={appFeeWaived}
          setAppFeeWaived={setAppFeeWaived}
          scholarship={scholarship}
          setScholarship={setScholarship}
          scholarshipNote={scholarshipNote}
          setScholarshipNote={setScholarshipNote}
        />
        <CourseRequirementsPanel
          hidden={activeTab !== 'Entry Requirements'}
          activeExams={activeExams}
          minScore={minScore}
          setMinScore={setMinScore}
          scheme={scheme}
          setScheme={setScheme}
          maxBacklogs={maxBacklogs}
          setMaxBacklogs={setMaxBacklogs}
          workExpMonths={workExpMonths}
          setWorkExpMonths={setWorkExpMonths}
          background={background}
          setBackground={setBackground}
          english={english}
          setEnglish={setEnglish}
          moiAccepted={moiAccepted}
          setMoiAccepted={setMoiAccepted}
          aptitude={aptitude}
          setAptitude={setAptitude}
          eligibility={eligibility}
          setEligibility={setEligibility}
        />
        <CourseFlagsPanel
          hidden={activeTab !== 'Flags'}
          studyMode={studyMode}
          setStudyMode={setStudyMode}
          delivery={delivery}
          setDelivery={setDelivery}
          coop={coop}
          setCoop={setCoop}
          psw={psw}
          setPsw={setPsw}
        />
      </form>
    </Modal>
  )
}

function CourseRowActions({ college, course }: { college: College; course: Course }) {
  const updateCourse = useUpdateCourse(course.id!)
  const [editing, setEditing] = useState(false)

  return (
    <div className="flex items-center justify-end gap-sm">
      {course.active && !course.visible && <Badge color="secondary">Hidden — college inactive</Badge>}
      <Toggle
        checked={Boolean(course.active)}
        onChange={(checked) => updateCourse.mutate({ active: checked })}
        label={`${course.name} active`}
      />
      <button
        type="button"
        onClick={() => setEditing(true)}
        aria-label={`Edit ${course.name}`}
        title="Edit"
        className="flex h-9 w-9 items-center justify-center rounded-md text-text-secondary hover:bg-background hover:text-text-primary"
      >
        <Pencil className="h-4 w-4" />
      </button>
      {editing && <CourseFormModal college={college} editingCourse={course} onClose={() => setEditing(false)} />}
    </div>
  )
}

function CampusRow({ collegeId, campus }: { collegeId: string; campus: Campus }) {
  const updateCampus = useUpdateCampus(collegeId)
  const [editing, setEditing] = useState(false)

  return (
    <div className="flex items-center gap-sm border-b border-border py-sm last:border-0">
      <p className="flex-1 text-body-sm text-text-primary">
        {campus.province_state}, {campus.country}
      </p>
      {campus.active && !campus.visible && <Badge color="secondary">Hidden — college inactive</Badge>}
      <Toggle
        checked={Boolean(campus.active)}
        onChange={(checked) => updateCampus.mutate({ campusId: campus.id!, body: { active: checked } })}
        label={`${campus.province_state} campus active`}
      />
      <button
        type="button"
        onClick={() => setEditing(true)}
        aria-label={`Edit ${campus.province_state} campus`}
        title="Edit"
        className="flex h-9 w-9 items-center justify-center rounded-md text-text-secondary hover:bg-background hover:text-text-primary"
      >
        <Pencil className="h-4 w-4" />
      </button>
      {editing && <CampusFormModal collegeId={collegeId} editingCampus={campus} onClose={() => setEditing(false)} />}
    </div>
  )
}

export function CollegeDetailPage() {
  const { id = '' } = useParams()
  const college = useCollegeDetail(id)
  const updateCollege = useUpdateCollege(id)
  const [editingCollege, setEditingCollege] = useState(false)
  const [showAddCampus, setShowAddCampus] = useState(false)
  const [showAddCourse, setShowAddCourse] = useState(false)

  const [courseSearch, setCourseSearch] = useState('')
  const [courseSort, setCourseSort] = useState<{ field: string; direction: 'asc' | 'desc' } | null>(null)
  const coursePaging = useCursorPagination()

  const courses = useCourses({
    collegeId: id,
    search: courseSearch || undefined,
    sort: courseSort ? (courseSort.direction === 'desc' ? `-${courseSort.field}` : courseSort.field) : undefined,
    cursor: coursePaging.cursor,
    limit: 20,
  })

  if (college.isLoading) {
    return (
      <AdminShell>
        <Skeleton className="h-40 rounded-lg" />
      </AdminShell>
    )
  }

  if (college.isError || !college.data) {
    return (
      <AdminShell>
        <ErrorState message="Could not load this college." onRetry={() => college.refetch()} />
      </AdminShell>
    )
  }

  const record = college.data

  const courseColumns: TableColumn<Course>[] = [
    {
      key: 'name',
      header: 'Course',
      sortable: true,
      render: (course) => {
        const feeLabel =
          course.fee?.amount != null ? `${course.fee.currency} ${course.fee.amount.toLocaleString()}` : null
        const detailLine = [course.level, course.field_of_study, course.duration, feeLabel].filter(Boolean).join(' · ')
        return (
          <div>
            <p className="font-medium text-text-primary">{course.name}</p>
            <p className="text-caption text-text-secondary">{detailLine || 'No details yet'}</p>
          </div>
        )
      },
    },
    {
      key: 'completeness',
      header: 'Data',
      hideBelow: 'sm',
      render: (course) => {
        const { done, total, missing } = courseCompleteness(course)
        return done === total ? (
          <Badge color="success">Complete</Badge>
        ) : (
          <span title={`Missing: ${missing.join(', ')}`}>
            <Badge color="warning">{`${done}/${total}`}</Badge>
          </span>
        )
      },
    },
    {
      key: 'actions',
      header: '',
      align: 'right',
      render: (course) => <CourseRowActions college={record} course={course} />,
    },
  ]

  return (
    <AdminShell>
      <div className="flex flex-col gap-lg">
        <div className="flex items-center gap-sm">
          <Link
            to="/admin/colleges"
            aria-label="Back to Colleges & Courses"
            title="Back to Colleges & Courses"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-text-secondary hover:bg-background hover:text-text-primary"
          >
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <h1 className="truncate text-h1 text-text-primary">{record.name}</h1>
        </div>

        <Card>
          <div className="flex items-start gap-md">
            {record.logo_url ? (
              <img src={record.logo_url} alt="" className="h-16 w-16 shrink-0 rounded-md object-cover bg-background" />
            ) : (
              <div className="h-16 w-16 shrink-0 rounded-md bg-background" />
            )}
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-sm">
                <Badge color={record.active ? 'success' : 'secondary'}>{record.active ? 'Active' : 'Inactive'}</Badge>
                {record.website && (
                  <a
                    href={record.website}
                    target="_blank"
                    rel="noreferrer"
                    className="text-body-sm text-primary hover:underline"
                  >
                    {record.website}
                  </a>
                )}
              </div>
              {record.description && <p className="mt-xs text-body-sm text-text-secondary">{record.description}</p>}
              {!record.active && (
                <p className="mt-xs text-caption text-text-secondary">
                  Every campus and course below is hidden from search while this college is inactive — their own active
                  toggles are untouched and will apply again as soon as this college is reactivated.
                </p>
              )}
            </div>
            <Toggle
              checked={Boolean(record.active)}
              onChange={(checked) => updateCollege.mutate({ active: checked })}
              label={`${record.name} active`}
            />
            <button
              type="button"
              onClick={() => setEditingCollege(true)}
              aria-label={`Edit ${record.name}`}
              title="Edit"
              className="flex h-9 w-9 items-center justify-center rounded-md text-text-secondary hover:bg-background hover:text-text-primary"
            >
              <Pencil className="h-4 w-4" />
            </button>
          </div>
        </Card>

        <Card>
          <div className="flex items-center justify-between">
            <h2 className="text-h2 text-text-primary">Campuses</h2>
            <Button variant="secondary" size="sm" onClick={() => setShowAddCampus(true)}>
              Add Campus
            </Button>
          </div>
          <div className="mt-sm">
            {(record.campuses ?? []).length === 0 && (
              <p className="text-caption text-text-secondary">No campuses yet.</p>
            )}
            {(record.campuses ?? []).map((campus) => (
              <CampusRow key={campus.id} collegeId={id} campus={campus} />
            ))}
          </div>
        </Card>

        <div className="flex items-center justify-between">
          <h2 className="text-h2 text-text-primary">Courses</h2>
          <Button size="sm" onClick={() => setShowAddCourse(true)}>
            Add Course
          </Button>
        </div>
        <Table
          columns={courseColumns}
          rows={courses.data?.items ?? []}
          rowKey={(course) => course.id!}
          loading={courses.isLoading}
          error={courses.isError ? 'Could not load courses.' : undefined}
          emptyMessage="No courses match these filters."
          sort={courseSort}
          onSortChange={(field, direction) => {
            setCourseSort({ field, direction })
            coursePaging.reset()
          }}
          search={{
            value: courseSearch,
            onChange: (value) => {
              setCourseSearch(value)
              coursePaging.reset()
            },
            placeholder: 'Search course name…',
          }}
          pagination={{
            hasNext: Boolean(courses.data?.meta.next_cursor),
            hasPrevious: coursePaging.hasPrevious,
            onNext: () => courses.data?.meta.next_cursor && coursePaging.next(courses.data.meta.next_cursor),
            onPrevious: coursePaging.previous,
            total: courses.data?.meta.total,
          }}
        />

        {editingCollege && <CollegeFormModal college={record} onClose={() => setEditingCollege(false)} />}
        {showAddCampus && <CampusFormModal collegeId={id} onClose={() => setShowAddCampus(false)} />}
        {showAddCourse && <CourseFormModal college={record} onClose={() => setShowAddCourse(false)} />}
      </div>
    </AdminShell>
  )
}
