import { useState } from 'react'
import { AppShell } from '@/features/auth/AppShell'
import { ApiError } from '@/api/errors'
import { Badge } from '@/components/Badge'
import { Button } from '@/components/Button'
import { Card } from '@/components/Card'
import { CompactSelect } from '@/components/CompactSelect'
import { Modal } from '@/components/Modal'
import { Table, type TableColumn } from '@/components/Table'
import { Toggle } from '@/components/Toggle'
import { useAccountWords } from '@/lib/accountWords'
import { useMeStaff } from '@/lib/me'
import { formatCourseFee } from '@/lib/money'
import { useCursorPagination } from '@/lib/pagination'
import { useLevelLadder } from '@/lib/studyLevels'
import { formatDate } from '@/lib/time'
import { showToast } from '@/lib/toast'
import { courseSwitchState, type CourseSwitchState } from '@/lib/courseSwitch'
import { useCourses, useSwitchCourse, type Course } from '@/queries/courseSuggestions'

const STATE_LABEL: Record<CourseSwitchState, string> = {
  on: 'On',
  off_by_college: 'Switched off by your college',
  off_by_platform: 'Switched off by immiNow',
  not_published: 'Not published yet',
}

const STATE_COLOR: Record<CourseSwitchState, 'success' | 'secondary' | 'warning'> = {
  on: 'success',
  off_by_college: 'secondary',
  off_by_platform: 'warning',
  not_published: 'secondary',
}

/** Why a locked switch cannot be used, for its tooltip and for a screen reader. */
const LOCKED_REASON: Partial<Record<CourseSwitchState, string>> = {
  off_by_platform: 'Switched off by immiNow. Only immiNow can switch it back on.',
}

/** The catalogue checks a course must pass to be switched on, as `details.missing` names them. */
const MISSING_LABEL: Record<string, string> = {
  fee: 'fee',
  duration: 'duration',
  deadline: 'application deadline',
  requirements: 'entry requirements',
  language: 'language of teaching',
  description: 'description',
  campus: 'campus',
}

type StatusFilter = '' | 'on' | 'off' | 'off_by_college' | 'off_by_platform'

/** "about 20 minutes" / "about 3 hours" from the server's `retry_after_seconds`. */
function retryIn(error: unknown): string | null {
  const seconds = error instanceof ApiError ? error.details?.retry_after_seconds : undefined
  if (typeof seconds !== 'number' || seconds <= 0) return null
  const minutes = Math.ceil(seconds / 60)
  if (minutes <= 1) return 'about a minute'
  if (minutes < 60) return `about ${minutes} minutes`
  const hours = Math.ceil(minutes / 60)
  return hours === 1 ? 'about an hour' : `about ${hours} hours`
}

/** What `useSwitchCourse` says when the server sent no sentence of its own. */
const SWITCH_FALLBACK = 'Could not switch this course.'

/** The server's sentence; for an incomplete course with none, one built from what is missing. */
function refusalText(error: Error, publish: boolean): string {
  const cannot = publish ? 'This course cannot be published yet.' : 'This course cannot be switched on yet.'
  if (error instanceof ApiError && error.code === 'course_incomplete') {
    const missing = Array.isArray(error.details?.missing)
      ? error.details.missing.filter((m): m is string => typeof m === 'string').map((m) => MISSING_LABEL[m] ?? m)
      : []
    // `ApiError` falls back to the caller's text when the server sent no sentence of its own.
    if (error.message === SWITCH_FALLBACK) {
      return missing.length > 0
        ? `${cannot} It is missing: ${missing.join(', ')}.`
        : `${cannot} Some of its details are missing.`
    }
  }
  return error.message
}

/** Refusals that asking again will not change: the confirm offers OK only. */
const FINAL_REFUSALS = new Set(['hidden_by_platform', 'course_incomplete', 'rate_limited'])

/**
 * Confirms a switch before it is made, saying exactly what happens (owner decision 18). Switching
 * off reaches students (the course leaves search, and anyone who saved it is told), so it is the
 * destructive one; both tell immiNow.
 *
 * `publish` is the same call as switching on (`active: true`), made on a draft that was never
 * published (owner ruling 11, 2026-10-07): students see the course for the first time, so the
 * words and the button say "Publish".
 */
function SwitchCourseModal({
  course,
  turnOn,
  publish = false,
  onClose,
}: {
  course: Course
  turnOn: boolean
  publish?: boolean
  onClose: () => void
}) {
  const switchCourse = useSwitchCourse()
  const name = course.name ?? 'this course'
  const error = switchCourse.error
  const code = error instanceof ApiError ? error.code : undefined
  const isFinal = Boolean(error) && (FINAL_REFUSALS.has(code ?? '') || (error instanceof ApiError && error.status === 429))
  const retry = retryIn(error)

  function confirm() {
    switchCourse.mutate(
      { id: course.id!, active: turnOn },
      {
        onSuccess: () => {
          showToast(publish ? `${name} published` : turnOn ? `${name} switched back on` : `${name} switched off`)
          onClose()
        },
        onError: (err) => {
          // Gone from this college's courses: nothing to act on here. The list is being read again.
          if (err instanceof ApiError && err.status === 404) {
            showToast('This course is no longer in your list. The list has been refreshed.', 'error')
            onClose()
          }
        },
      },
    )
  }

  return (
    <Modal
      onClose={onClose}
      title={publish ? 'Publish this course?' : turnOn ? 'Switch this course back on?' : 'Switch this course off?'}
      widthRem={32}
      footer={
        isFinal ? (
          <Button variant="secondary" onClick={onClose}>
            OK
          </Button>
        ) : (
          <>
            <Button variant="secondary" onClick={onClose} disabled={switchCourse.isPending}>
              Cancel
            </Button>
            <Button variant={turnOn ? 'primary' : 'destructive'} loading={switchCourse.isPending} onClick={confirm}>
              {publish ? 'Publish' : turnOn ? 'Switch on' : 'Switch off'}
            </Button>
          </>
        )
      }
    >
      <div className="flex flex-col gap-sm">
        <p className="text-body-sm text-text-primary">
          {publish ? (
            <>
              Publish <span className="font-medium">{name}</span>? Students will be able to find it, save it and apply
              for it. immiNow is told of this change.
            </>
          ) : turnOn ? (
            <>
              Switch <span className="font-medium">{name}</span> back on? Students will be able to find it again. immiNow
              is told of this change.
            </>
          ) : (
            <>
              Switch off <span className="font-medium">{name}</span>? Students will no longer find it or be able to save
              or apply for it. Students who saved it will see it as no longer available and be notified. Applications
              already made are not affected. immiNow is told of this change.
            </>
          )}
        </p>
        {switchCourse.isError && (
          <div role="alert" className="flex flex-col gap-0.5 rounded-md bg-error/10 px-md py-sm">
            <p className="text-body-sm text-error">{refusalText(switchCourse.error, publish)}</p>
            {retry && <p className="text-caption text-text-secondary">You can try again in {retry}.</p>}
          </div>
        )}
      </div>
    </Modal>
  )
}

function CourseSwitch({ course }: { course: Course }) {
  const [confirming, setConfirming] = useState(false)
  const state = courseSwitchState(course)
  const locked = state === 'off_by_platform'
  const name = course.name ?? 'this course'
  // A draft has never been on, so it gets a button that says what pressing it does, not a switch
  // that reads as "off": publishing is the college's own to do (owner ruling 11, 2026-10-07).
  if (state === 'not_published') {
    return (
      <div className="flex items-center justify-end">
        <Button size="sm" variant="secondary" aria-label={`Publish ${name}`} onClick={() => setConfirming(true)}>
          Publish
        </Button>
        {confirming && <SwitchCourseModal course={course} turnOn publish onClose={() => setConfirming(false)} />}
      </div>
    )
  }
  return (
    <div className="flex items-center justify-end" title={locked ? LOCKED_REASON[state] : undefined}>
      <Toggle
        size="sm"
        checked={state === 'on'}
        disabled={locked}
        onChange={() => setConfirming(true)}
        label={locked ? `${name}: ${LOCKED_REASON[state]}` : state === 'on' ? `Switch off ${name}` : `Switch ${name} back on`}
      />
      {confirming && <SwitchCourseModal course={course} turnOn={state !== 'on'} onClose={() => setConfirming(false)} />}
    </div>
  )
}

/**
 * A college's own courses, with a switch on each (owner decision 18). For an INSTITUTE account's
 * staff who hold "Manage course suggestions" — the route and the sidebar link check both.
 *
 * `GET /courses` answers an institute with its own college's courses only, the switched-off ones
 * included, so nothing here names the college: the server decides the scope. A course the college
 * switched off itself can be switched back on here; one immiNow switched off, or one that was
 * shown with the reason and a locked switch. A draft that was never published has a Publish
 * button in place of the switch.
 */
export function InstituteCoursesPage() {
  const { isInstitute } = useAccountWords()
  const staff = useMeStaff()
  const ladder = useLevelLadder()
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState<StatusFilter>('')
  const [sort, setSort] = useState<{ field: string; direction: 'asc' | 'desc' } | null>(null)
  const paging = useCursorPagination()

  const courses = useCourses({
    search: search || undefined,
    active: status === 'on' ? true : status === 'off' ? false : undefined,
    hiddenBy: status === 'off_by_college' ? 'institute' : status === 'off_by_platform' ? 'platform' : undefined,
    sort: sort ? (sort.direction === 'desc' ? `-${sort.field}` : sort.field) : undefined,
    cursor: paging.cursor,
    limit: 20,
  })

  if (!isInstitute) {
    return (
      <AppShell>
        <Card>
          <p className="text-body text-text-primary">This page is for college accounts.</p>
          <p className="mt-xs text-body-sm text-text-secondary">
            A college uses it to switch its own courses on and off. To look for courses, use Course Finder.
          </p>
        </Card>
      </AppShell>
    )
  }

  const columns: TableColumn<Course>[] = [
    {
      key: 'name',
      header: 'Course',
      sortable: true,
      render: (course) => {
        const detail = [course.level ? ladder.label(course.level) : null, course.field_of_study].filter(Boolean).join(' · ')
        return (
          <div>
            <p className="font-medium text-text-primary">{course.name}</p>
            {detail && <p className="text-caption text-text-secondary">{detail}</p>}
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
      key: 'status',
      header: 'Status',
      render: (course) => {
        const state = courseSwitchState(course)
        return (
          <div className="flex flex-col items-start gap-0.5">
            <Badge color={STATE_COLOR[state]}>{STATE_LABEL[state]}</Badge>
            {state !== 'on' && course.hidden_at && (
              <span className="text-caption text-text-secondary">Since {formatDate(course.hidden_at)}</span>
            )}
          </div>
        )
      },
    },
    {
      key: 'switch',
      header: 'On / off',
      align: 'right',
      render: (course) => <CourseSwitch course={course} />,
    },
  ]

  const filtered = Boolean(search || status)

  return (
    <AppShell>
      <div className="flex flex-col gap-lg">
        <div>
          <h1 className="text-h1 text-text-primary">Your Courses</h1>
          <p className="text-body-sm text-text-secondary">
            Every course of your college, including the ones that are switched off. Switch a course off to stop
            students finding it. You can switch back on any course your college switched off, and publish a
            course that is not published yet.
          </p>
        </div>

        {staff && !staff.college_id ? (
          <Card>
            <p className="text-body text-text-primary">Your account is not linked to a college yet.</p>
            <p className="mt-xs text-body-sm text-text-secondary">
              Your courses appear here once immiNow has linked this account to your college.
            </p>
          </Card>
        ) : (
          <Table
            columns={columns}
            rows={courses.data?.items ?? []}
            rowKey={(course) => course.id!}
            loading={courses.isLoading}
            error={courses.isError ? 'Could not load your courses.' : undefined}
            errorSource={courses.error}
            emptyMessage={filtered ? 'No courses match these filters.' : 'Your college has no courses listed yet.'}
            sort={sort}
            onSortChange={(field, direction) => {
              setSort({ field, direction })
              paging.reset()
            }}
            search={{
              value: search,
              onChange: (value) => {
                setSearch(value)
                paging.reset()
              },
              placeholder: 'Search course name…',
            }}
            filters={
              <CompactSelect
                value={status}
                onChange={(e) => {
                  setStatus(e.target.value as StatusFilter)
                  paging.reset()
                }}
                label="Status"
              >
                <option value="">Any status</option>
                <option value="on">On</option>
                <option value="off">Off</option>
                <option value="off_by_college">Switched off by your college</option>
                <option value="off_by_platform">Switched off by immiNow</option>
              </CompactSelect>
            }
            pagination={{
              hasNext: Boolean(courses.data?.meta.next_cursor),
              hasPrevious: paging.hasPrevious,
              onNext: () => courses.data?.meta.next_cursor && paging.next(courses.data.meta.next_cursor),
              onPrevious: paging.previous,
              total: courses.data?.meta.total,
            }}
          />
        )}
      </div>
    </AppShell>
  )
}
