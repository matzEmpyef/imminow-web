import { useState } from 'react'
import { Modal } from '@/components/Modal'
import { Button } from '@/components/Button'
import { useCourses } from '@/queries/courseSuggestions'
import { useAddSelectedCollege } from '@/queries/clients'

type Course = NonNullable<ReturnType<typeof useCourses>['data']>['items'][number]

// User-requested (2026-08-19) — Selected Colleges had a working POST /clients/{id}/selected-
// colleges endpoint and mutation hook, but no frontend surface ever called it: there was no way
// to add a college at all. This is that missing entry point, plus the cross-country check asked
// for alongside it — "once country is decided, if colleges other than of that country selected
// then confirm with consultant. if consultant still proceeds then inform super admin." The
// confirm step swaps this same Modal's content rather than stacking a second overlay.
export function AddSelectedCollegeModal({
  clientId,
  finalizedCountry,
  onClose,
}: {
  clientId: string
  finalizedCountry: string | null
  onClose: () => void
}) {
  const [search, setSearch] = useState('')
  const courses = useCourses({ search: search || undefined, limit: 20 })
  const addCollege = useAddSelectedCollege(clientId)
  const [confirmCourse, setConfirmCourse] = useState<Course | null>(null)

  function selectCourse(course: Course) {
    if (finalizedCountry && course.country && course.country !== finalizedCountry) {
      setConfirmCourse(course)
      return
    }
    addCollege.mutate({ course_id: course.id }, { onSuccess: onClose })
  }

  if (confirmCourse) {
    return (
      <Modal
        onClose={onClose}
        title="Different Country"
        widthRem={28}
        footer={
          <>
            <Button variant="secondary" onClick={() => setConfirmCourse(null)}>
              Back
            </Button>
            <Button
              loading={addCollege.isPending}
              onClick={() =>
                addCollege.mutate({ course_id: confirmCourse.id }, { onSuccess: onClose })
              }
            >
              Add Anyway
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-sm">
          <p className="text-body-sm text-text-primary">
            <strong>{confirmCourse.name}</strong> ({confirmCourse.college_name}) is in{' '}
            <strong>{confirmCourse.country}</strong>, but this client has finalized <strong>{finalizedCountry}</strong>{' '}
            as the country to apply.
          </p>
          <p className="text-body-sm text-text-secondary">
            If you proceed, Platform Admin will be notified of the mismatch.
          </p>
          {addCollege.isError && <p className="text-body-sm text-error">{addCollege.error.message}</p>}
        </div>
      </Modal>
    )
  }

  return (
    <Modal onClose={onClose} title="Add a College" widthRem={30}>
      <div className="flex flex-col gap-md">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search courses or colleges…"
          className="h-10 rounded-md border border-border bg-surface px-3 text-body"
        />
        <div className="flex max-h-80 flex-col gap-xs overflow-y-auto">
          {courses.isLoading && <p className="text-body-sm text-text-secondary">Loading…</p>}
          {courses.data?.items.length === 0 && <p className="text-body-sm text-text-secondary">No courses match.</p>}
          {courses.data?.items.map((course) => (
            <div
              key={course.id}
              className="flex items-center justify-between gap-sm rounded-md border border-border p-sm"
            >
              <div className="min-w-0">
                <p className="truncate text-body-sm text-text-primary">{course.name}</p>
                <p className="truncate text-caption text-text-secondary">
                  {course.college_name}
                  {course.country ? ` · ${course.country}` : ''}
                </p>
              </div>
              <Button
                variant="secondary"
                className="shrink-0"
                loading={addCollege.isPending && addCollege.variables?.course_id === course.id}
                onClick={() => selectCourse(course)}
              >
                Select
              </Button>
            </div>
          ))}
        </div>
        {addCollege.isError && <p className="text-body-sm text-error">{addCollege.error.message}</p>}
      </div>
    </Modal>
  )
}
