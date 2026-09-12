import { useState, type FormEvent } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { ArrowLeft, Pencil } from 'lucide-react'
import { AdminShell } from '@/features/auth/AdminShell'
import { Card } from '@/components/Card'
import { ErrorState, Skeleton } from '@/components/QueryState'
import { Button } from '@/components/Button'
import { Badge } from '@/components/Badge'
import { TextField } from '@/components/TextField'
import { CountrySelect } from '@/components/CountrySelect'
import { CompactSelect } from '@/components/CompactSelect'
import { Toggle } from '@/components/Toggle'
import { Modal } from '@/components/Modal'
import { Table, type TableColumn } from '@/components/Table'
import {
  useCollegeDetail,
  useCreateCampus,
  useDeactivationImpact,
  useUpdateCampus,
  useUpdateCollege,
} from '@/queries/adminColleges'
import { useCourse, useCourses, useCreateCourse, useUpdateCourse } from '@/queries/courseSuggestions'
import { useExams } from '@/queries/catalogSettings'
import { useStudyLevels } from '@/queries/studyLevels'
import { useCursorPagination } from '@/lib/pagination'
import { showToast } from '@/lib/toast'
import { FORM_TABS, courseCompleteness } from './courseFormShared'
import {
  CourseBasicsPanel,
  CourseCampusIntakesPanel,
  CourseFeesPanel,
  CourseFlagsPanel,
  CourseRequirementsPanel,
} from './CourseFormPanels'
import { useCourseForm } from './useCourseForm'
import { CollegeFormModal } from './CollegeFormModal'
import type { components } from '@/api/schema'
import { formatCourseFee } from '@/lib/money'

type College = components['schemas']['College']
type Campus = components['schemas']['Campus']
type Course = components['schemas']['Course']

// The six capture checks, as people read them (courseCompleteness returns keys).
const CHECK_LABELS: Record<string, string> = {
  fee: 'Fee',
  duration: 'Duration',
  deadlines: 'Application deadline',
  requirements: 'Entry requirements',
  language: 'Language',
  campus: 'Campus',
}

function titleCase(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1)
}

function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? '' : 's'}`
}

function campusLabel(campus: Campus): string {
  return [campus.city, campus.province_state, campus.country].filter(Boolean).join(', ')
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
    const label = [city, provinceState].filter(Boolean).join(', ') || 'Campus'
    if (editingCampus) {
      updateCampus.mutate(
        { campusId: editingCampus.id!, body },
        {
          onSuccess: () => {
            showToast(`${label} campus updated`)
            onClose()
          },
        },
      )
    } else {
      createCampus.mutate(body, {
        onSuccess: () => {
          showToast(`${label} campus added`)
          onClose()
        },
      })
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
          label="State/Province"
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
// `prefill` starts a NEW course from known values — Suggestions Review opens this form filled from
// a consultancy's suggested course (2026-09-11); `onCreated` hands back the saved course.
export function CourseFormModal({
  college,
  editingCourse,
  prefill,
  defaultCampusId,
  onClose,
  onCreated,
}: {
  college: College
  editingCourse?: Course
  prefill?: Partial<Course>
  defaultCampusId?: string
  onClose: () => void
  onCreated?: (course: Course) => void
}) {
  const isEditing = Boolean(editingCourse)
  const createCourse = useCreateCourse()
  const updateCourse = useUpdateCourse(editingCourse?.id ?? '')
  const examsCatalog = useExams()
  const form = useCourseForm(college, editingCourse ?? (prefill as Course | undefined), defaultCampusId)

  const mutation = isEditing ? updateCourse : createCourse
  const activeExams = (examsCatalog.data ?? []).filter((e) => e.active !== false)

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!form.isValid) return
    const body = form.toPayload()
    if (isEditing) {
      updateCourse.mutate(body, {
        onSuccess: () => {
          showToast(`${form.name || 'Course'} saved`)
          onClose()
        },
      })
    } else {
      createCourse.mutate(
        { ...body, college_id: college.id!, active: true },
        {
          onSuccess: (created) => {
            showToast(`${form.name || 'Course'} created`)
            onCreated?.(created as Course)
            onClose()
          },
        },
      )
    }
  }

  return (
    <Modal
      onClose={onClose}
      title={isEditing ? 'Edit Course' : 'Add Course'}
      widthRem={48}
      footer={
        <>
          {mutation.isError && <p className="mr-auto self-center text-body-sm text-error">{mutation.error.message}</p>}
          {!form.language && (
            <p className="mr-auto self-center text-body-sm text-text-secondary">
              Language of teaching is required (Basics tab).
            </p>
          )}
          {form.campusRequired && (
            <p className="mr-auto self-center text-body-sm text-error">
              Pick at least one campus (Campuses &amp; Intakes tab).
            </p>
          )}
          <Button type="submit" form="course-form" loading={mutation.isPending} disabled={!form.isValid}>
            {isEditing ? 'Save Changes' : 'Create Course'}
          </Button>
        </>
      }
    >
      {/* Pinned under the header while the fields scroll (user, 2026-09-11) — the tabs used to
          scroll away with the Basics fields, so switching tab meant scrolling back up first. */}
      <div className="sticky top-0 z-10 -mx-lg -mt-md mb-md flex gap-xs border-b border-border bg-surface px-lg pt-sm">
        {FORM_TABS.map((tab) => {
          // A dot on the tab that holds a missing capture check (2026-09-11) — the same six checks
          // as the Data column, so the gap is findable without opening every tab.
          const missing =
            tab === 'Basics'
              ? !form.language
                ? 'language of teaching'
                : !form.durationMonths
                  ? 'length in months'
                  : null
              : tab === 'Campuses & Intakes'
                ? form.campusRequired
                  ? 'a campus'
                  : form.intakes.some((m) => form.deadlines[m]?.deadline)
                    ? null
                    : 'an application deadline'
                : tab === 'Fees'
                  ? form.feeAmount
                    ? null
                    : 'tuition fee'
                  : tab === 'Entry Requirements'
                    ? form.minScore ||
                      form.maxBacklogs ||
                      form.workExpMonths ||
                      form.background ||
                      form.english.length ||
                      form.aptitude.length ||
                      form.moiAccepted
                      ? null
                      : 'entry requirements'
                    : null
          return (
            <button
              key={tab}
              type="button"
              onClick={() => form.setActiveTab(tab)}
              title={missing ? `Missing ${missing}` : undefined}
              className={`flex items-center gap-xs whitespace-nowrap border-b-2 px-sm py-sm text-body-sm font-medium ${
                form.activeTab === tab
                  ? 'border-primary text-primary'
                  : 'border-transparent text-text-secondary hover:text-text-primary'
              }`}
            >
              {tab}
              {missing && (
                <>
                  <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-warning" />
                  <span className="sr-only">(missing {missing})</span>
                </>
              )}
            </button>
          )
        })}
      </div>
      <form id="course-form" onSubmit={handleSubmit} className="flex flex-col gap-md">
        {/* All five panels stay mounted and toggle via the hidden class — conditional mounting
            would throw away in-progress state in the other tabs. See CourseFormPanels.tsx. */}
        <CourseBasicsPanel hidden={form.activeTab !== 'Basics'} form={form} />
        <CourseCampusIntakesPanel hidden={form.activeTab !== 'Campuses & Intakes'} college={college} form={form} />
        <CourseFeesPanel
          hidden={form.activeTab !== 'Fees'}
          form={form}
          collegeId={college.id!}
          excludeCourseId={editingCourse?.id}
        />
        <CourseRequirementsPanel
          hidden={form.activeTab !== 'Entry Requirements'}
          activeExams={activeExams}
          form={form}
        />
        <CourseFlagsPanel hidden={form.activeTab !== 'Flags'} form={form} />
      </form>
    </Modal>
  )
}

// Switching a college or course off hides it from students at once (2026-09-11) — one stray click
// used to do that silently. The confirm says what it touches before anything changes.
function DeactivateConfirmModal({
  kind,
  id,
  name,
  loading,
  onConfirm,
  onClose,
}: {
  kind: 'college' | 'course'
  id: string
  name: string
  loading: boolean
  onConfirm: () => void
  onClose: () => void
}) {
  const impact = useDeactivationImpact(kind, id)
  const d = impact.data
  return (
    <Modal
      onClose={onClose}
      title={`Switch off ${name}?`}
      widthRem={30}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="destructive" loading={loading} disabled={impact.isLoading} onClick={onConfirm}>
            Switch off
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-sm text-body-sm text-text-secondary">
        {impact.isLoading && <p>Checking what this affects…</p>}
        {impact.isError && <p className="text-error">{impact.error.message}</p>}
        {d && (
          <ul className="flex list-disc flex-col gap-xs pl-lg">
            <li>
              {kind === 'college' ? (
                <>
                  <span className="font-medium text-text-primary">{plural(d.courses_hidden, 'active course')}</span>{' '}
                  will be hidden from students&rsquo; search.
                </>
              ) : (
                'It will be hidden from students’ search.'
              )}
            </li>
            <li>
              <span className="font-medium text-text-primary">{plural(d.shortlisted_students, 'student')}</span>{' '}
              {d.shortlisted_students === 1 ? 'has' : 'have'} {kind === 'college' ? 'its courses' : 'it'} shortlisted.
            </li>
            <li>
              <span className="font-medium text-text-primary">{plural(d.live_applications, 'application')}</span>{' '}
              in progress — these carry on and are not cancelled.
            </li>
          </ul>
        )}
        <p className="text-caption">You can switch it back on at any time.</p>
      </div>
    </Modal>
  )
}

function CourseRowActions({ college, course }: { college: College; course: Course }) {
  const updateCourse = useUpdateCourse(course.id!)
  const [editing, setEditing] = useState(false)
  const [confirmingOff, setConfirmingOff] = useState(false)

  return (
    <div className="flex items-center justify-end gap-sm">
      {course.active && !course.visible && <Badge color="secondary">Hidden — college inactive</Badge>}
      <Toggle
        size="sm"
        checked={Boolean(course.active)}
        onChange={(checked) => (checked ? updateCourse.mutate({ active: true }) : setConfirmingOff(true))}
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
      {confirmingOff && (
        <DeactivateConfirmModal
          kind="course"
          id={course.id!}
          name={course.name ?? 'this course'}
          loading={updateCourse.isPending}
          onClose={() => setConfirmingOff(false)}
          onConfirm={() => updateCourse.mutate({ active: false }, { onSuccess: () => setConfirmingOff(false) })}
        />
      )}
    </div>
  )
}

function CampusRow({ collegeId, campus }: { collegeId: string; campus: Campus }) {
  const updateCampus = useUpdateCampus(collegeId)
  const [editing, setEditing] = useState(false)
  const [confirmingOff, setConfirmingOff] = useState(false)
  const courseCount = campus.course_count ?? 0

  return (
    <div className="flex items-center gap-sm border-b border-border py-sm last:border-0">
      <div className="min-w-0 flex-1">
        <p className="text-body-sm text-text-primary">{campusLabel(campus)}</p>
        <p className="text-caption text-text-secondary">{plural(courseCount, 'course')} taught here</p>
      </div>
      {campus.active && !campus.visible && <Badge color="secondary">Hidden — college inactive</Badge>}
      <Toggle
        checked={Boolean(campus.active)}
        onChange={(checked) =>
          checked
            ? updateCampus.mutate({ campusId: campus.id!, body: { active: true } })
            : setConfirmingOff(true)
        }
        label={`${campusLabel(campus)} campus active`}
      />
      <button
        type="button"
        onClick={() => setEditing(true)}
        aria-label={`Edit ${campusLabel(campus)} campus`}
        title="Edit"
        className="flex h-9 w-9 items-center justify-center rounded-md text-text-secondary hover:bg-background hover:text-text-primary"
      >
        <Pencil className="h-4 w-4" />
      </button>
      {editing && <CampusFormModal collegeId={collegeId} editingCampus={campus} onClose={() => setEditing(false)} />}
      {confirmingOff && (
        <Modal
          onClose={() => setConfirmingOff(false)}
          title="Switch off this campus?"
          widthRem={28}
          footer={
            <>
              <Button variant="secondary" onClick={() => setConfirmingOff(false)}>
                Cancel
              </Button>
              <Button
                variant="destructive"
                loading={updateCampus.isPending}
                onClick={() =>
                  updateCampus.mutate(
                    { campusId: campus.id!, body: { active: false } },
                    { onSuccess: () => setConfirmingOff(false) },
                  )
                }
              >
                Switch off
              </Button>
            </>
          }
        >
          <p className="text-body-sm text-text-secondary">
            {campusLabel(campus)} will stop appearing as a location for the {plural(courseCount, 'course')} taught
            here. The courses themselves stay listed. You can switch it back on at any time.
          </p>
        </Modal>
      )}
    </div>
  )
}

export function CollegeDetailPage() {
  const { id = '' } = useParams()
  const college = useCollegeDetail(id)
  const updateCollege = useUpdateCollege(id)
  const studyLevels = useStudyLevels()
  const [editingCollege, setEditingCollege] = useState(false)
  const [searchParams, setSearchParams] = useSearchParams()
  const editCourse = useCourse(searchParams.get('edit'))
  function clearEditParam() {
    const next = new URLSearchParams(searchParams)
    next.delete('edit')
    setSearchParams(next, { replace: true })
  }
  const [confirmingCollegeOff, setConfirmingCollegeOff] = useState(false)
  const [showAddCampus, setShowAddCampus] = useState(false)
  const [showAddCourse, setShowAddCourse] = useState(false)

  const [courseSearch, setCourseSearch] = useState('')
  const [courseSort, setCourseSort] = useState<{ field: string; direction: 'asc' | 'desc' } | null>(null)
  const [levelFilter, setLevelFilter] = useState('')
  const [fieldFilter, setFieldFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState<'' | 'active' | 'inactive'>('')
  const [healthFilter, setHealthFilter] = useState<'' | 'needs_details' | 'complete'>('')
  const coursePaging = useCursorPagination()

  const courses = useCourses({
    collegeId: id,
    search: courseSearch || undefined,
    level: levelFilter || undefined,
    fieldOfStudy: fieldFilter || undefined,
    active: statusFilter ? statusFilter === 'active' : undefined,
    health: healthFilter || undefined,
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
  const levelLabel = (code?: string | null) =>
    code ? (studyLevels.data?.find((l) => l.code === code)?.label ?? titleCase(code)) : null
  const facts = [
    record.institution_type ? titleCase(record.institution_type) : null,
    record.qs_rank != null ? `QS #${record.qs_rank}` : null,
    record.the_rank != null ? `THE #${record.the_rank}` : null,
    record.acceptance_rate != null ? `${record.acceptance_rate}% acceptance` : null,
  ].filter(Boolean)
  const partners = record.partner_consultancies ?? []
  const campusCount = (record.campuses ?? []).length
  const filtered = Boolean(courseSearch || levelFilter || fieldFilter || statusFilter || healthFilter)

  function resetCoursePaging() {
    coursePaging.reset()
  }

  const courseColumns: TableColumn<Course>[] = [
    {
      key: 'name',
      header: 'Course',
      sortable: true,
      render: (course) => {
        const detailLine = [levelLabel(course.level), course.field_of_study].filter(Boolean).join(' · ')
        return (
          <div>
            <p className="flex items-center gap-xs font-medium text-text-primary">
              {course.name}
              {course.active === false && <Badge color="secondary">Off</Badge>}
            </p>
            <p className="text-caption text-text-secondary">{detailLine || 'No level or field yet'}</p>
          </div>
        )
      },
    },
    {
      key: 'fee',
      header: 'Fee',
      sortable: true,
      align: 'right',
      hideBelow: 'md',
      render: (course) =>
        course.fee?.amount != null ? (
          <span className="whitespace-nowrap">{formatCourseFee(course.fee, course.fee_period)}</span>
        ) : (
          <span className="text-text-secondary">—</span>
        ),
    },
    {
      key: 'duration',
      header: 'Duration',
      sortable: true,
      align: 'right',
      hideBelow: 'lg',
      render: (course) =>
        course.duration || (course.duration_months != null ? `${course.duration_months} months` : null) || (
          <span className="text-text-secondary">—</span>
        ),
    },
    {
      // Course Popularity's own copy promises "You will still see them here" for platform staff
      // regardless of the student-facing toggle (Settings → Course Popularity, 2026-09-12) — this
      // is that promise kept. view_count is always sent to platform staff (server contract).
      key: 'view_count',
      header: 'Views',
      align: 'right',
      hideBelow: 'lg',
      render: (course) => <span className="tabular-nums text-text-secondary">{course.view_count ?? 0}</span>,
    },
    {
      // What's missing, in words (2026-09-11) — it used to be "4/5" with the detail only on hover.
      key: 'completeness',
      header: 'Data',
      hideBelow: 'sm',
      render: (course) => {
        const hasActiveCampuses = (record.campuses ?? []).some((c) => c.active !== false)
        const { done, total, missing } = courseCompleteness(course, hasActiveCampuses)
        if (done === total) return <Badge color="success">Complete</Badge>
        const labels = missing.map((m) => CHECK_LABELS[m] ?? m)
        return (
          <span className="flex flex-col items-start" title={`Missing: ${labels.join(', ')}`}>
            <Badge color="warning">{`${done}/${total}`}</Badge>
            <span className="text-caption text-text-secondary">Missing {labels.join(', ')}</span>
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
            <div className="flex min-w-0 flex-1 flex-col gap-xs">
              <div className="flex flex-wrap items-center gap-sm">
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
              {/* The facts the edit form already collects (2026-09-11) — they were never shown. */}
              {facts.length > 0 && <p className="text-body-sm text-text-primary">{facts.join(' · ')}</p>}
              {record.description && <p className="text-body-sm text-text-secondary">{record.description}</p>}
              <p className="text-caption text-text-secondary">
                {campusCount === 1 ? '1 campus' : `${campusCount} campuses`} · {plural(record.course_count ?? 0, 'course')},{' '}
                {record.complete_course_count ?? 0} with complete details
              </p>
              <p className="text-caption text-text-secondary">
                <span className="font-medium text-text-primary">Partner consultancies ({partners.length}):</span>{' '}
                {partners.length === 0
                  ? 'none yet'
                  : partners
                      .slice(0, 5)
                      .map((p) => p.name)
                      .join(', ') + (partners.length > 5 ? ` and ${partners.length - 5} more` : '')}
              </p>
              {!record.active && (
                <p className="text-caption text-text-secondary">
                  Every campus and course below is hidden from search while this college is inactive — their own active
                  toggles are untouched and will apply again as soon as this college is reactivated.
                </p>
              )}
            </div>
            <Toggle
              checked={Boolean(record.active)}
              onChange={(checked) => (checked ? updateCollege.mutate({ active: true }) : setConfirmingCollegeOff(true))}
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
            {campusCount === 0 && <p className="text-caption text-text-secondary">No campuses yet.</p>}
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
          emptyMessage={
            filtered ? 'No courses match these filters.' : 'No courses yet for this college. Add one with Add Course above.'
          }
          sort={courseSort}
          onSortChange={(field, direction) => {
            setCourseSort({ field, direction })
            resetCoursePaging()
          }}
          search={{
            value: courseSearch,
            onChange: (value) => {
              setCourseSearch(value)
              resetCoursePaging()
            },
            placeholder: 'Search course name…',
          }}
          filters={
            <>
              <CompactSelect
                value={levelFilter}
                onChange={(e) => {
                  setLevelFilter(e.target.value)
                  resetCoursePaging()
                }}
                label="Level"
              >
                <option value="">Any level</option>
                {(studyLevels.data ?? []).map((l) => (
                  <option key={l.code} value={l.code}>
                    {l.label}
                  </option>
                ))}
              </CompactSelect>
              <CompactSelect
                value={fieldFilter}
                onChange={(e) => {
                  setFieldFilter(e.target.value)
                  resetCoursePaging()
                }}
                label="Field"
              >
                <option value="">Any field</option>
                {(record.fields_of_study ?? []).map((f) => (
                  <option key={f} value={f}>
                    {f}
                  </option>
                ))}
              </CompactSelect>
              <CompactSelect
                value={statusFilter}
                onChange={(e) => {
                  setStatusFilter(e.target.value as '' | 'active' | 'inactive')
                  resetCoursePaging()
                }}
                label="Status"
              >
                <option value="">Any status</option>
                <option value="active">On</option>
                <option value="inactive">Off</option>
              </CompactSelect>
              <CompactSelect
                value={healthFilter}
                onChange={(e) => {
                  setHealthFilter(e.target.value as '' | 'needs_details' | 'complete')
                  resetCoursePaging()
                }}
                label="Details"
              >
                <option value="">Any details</option>
                <option value="needs_details">Needs details</option>
                <option value="complete">Complete</option>
              </CompactSelect>
            </>
          }
          pagination={{
            hasNext: Boolean(courses.data?.meta.next_cursor),
            hasPrevious: coursePaging.hasPrevious,
            onNext: () => courses.data?.meta.next_cursor && coursePaging.next(courses.data.meta.next_cursor),
            onPrevious: coursePaging.previous,
            total: courses.data?.meta.total,
          }}
        />

        {editingCollege && <CollegeFormModal college={record} onClose={() => setEditingCollege(false)} />}
        {confirmingCollegeOff && (
          <DeactivateConfirmModal
            kind="college"
            id={id}
            name={record.name ?? 'this college'}
            loading={updateCollege.isPending}
            onClose={() => setConfirmingCollegeOff(false)}
            onConfirm={() => updateCollege.mutate({ active: false }, { onSuccess: () => setConfirmingCollegeOff(false) })}
          />
        )}
        {showAddCampus && <CampusFormModal collegeId={id} onClose={() => setShowAddCampus(false)} />}
        {showAddCourse && <CourseFormModal college={record} onClose={() => setShowAddCourse(false)} />}
        {/* Suggestions Review's "Open course" (review H13, 2026-09-12): /admin/colleges/:id?edit=<courseId>
            opens that course's edit form with its current values — nothing pre-filled. */}
        {editCourse.data && editCourse.data.college_id === id && (
          <CourseFormModal college={record} editingCourse={editCourse.data} onClose={clearEditParam} />
        )}
      </div>
    </AdminShell>
  )
}
