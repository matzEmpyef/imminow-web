import { useState } from 'react'
import { Modal } from '@/components/Modal'
import { Button } from '@/components/Button'
import { SearchSelect } from '@/components/SearchSelect'
import { useCourses } from '@/queries/courseSuggestions'
import { useAddApplication } from '@/queries/clients'
import { showToast } from '@/lib/toast'

type Course = NonNullable<ReturnType<typeof useCourses>['data']>['items'][number]

// User-requested (2026-08-19) — Applications had a working POST /clients/{id}/
// colleges endpoint and mutation hook, but no frontend surface ever called it: there was no way
// to add a college at all. This is that missing entry point, plus the cross-country check asked
// for alongside it — "once country is decided, if colleges other than of that country selected
// then confirm with consultant. if consultant still proceeds then inform super admin." The
// confirm step swaps this same Modal's content rather than stacking a second overlay.
//
// M7 (2026-08-29): the plain list here offered no type-to-filter and happily listed courses
// already on the journey (a consultant could "add" the same course twice, landing on a 409 or a
// silent duplicate row). Now takes the journey's already-selected course ids from the caller
// (ApplicationsTab already has them via useApplications — no second fetch needed here)
// and filters them out before they ever reach the picker, and uses the shared SearchSelect
// (same pattern as CreateInvoiceForm's applicant picker) instead of a hand-rolled list, so this
// scales the same way past the seed catalog as every other course/client picker in the app.
export function AddApplicationModal({
  clientId,
  finalizedCountry,
  takenCourseIds,
  onClose,
}: {
  clientId: string
  finalizedCountry: string | null
  takenCourseIds: string[]
  onClose: () => void
}) {
  const courses = useCourses({ limit: 100 })
  const addCollege = useAddApplication(clientId)
  const [confirmCourse, setConfirmCourse] = useState<Course | null>(null)
  // The course still needs a campus chosen before it can be added (2026-09-16).
  const [campusCourse, setCampusCourse] = useState<Course | null>(null)
  const [pickedId, setPickedId] = useState('')

  const takenSet = new Set(takenCourseIds)
  // A course already on the list is hidden ONLY when it has a single campus. With several, the
  // same course at a different campus is a second, legitimate application (students do apply to
  // both UBC campuses), and the server refuses the exact duplicate.
  const availableCourses = (courses.data?.items ?? []).filter(
    (c) => !takenSet.has(c.id) || (c.campuses?.length ?? 0) > 1,
  )

  function add(course: Course, campusId?: string) {
    addCollege.mutate(
      { course_id: course.id, campus_id: campusId },
      {
        onSuccess: () => {
          showToast(`${course.name} added`)
          onClose()
        },
      },
    )
  }

  function selectCourse(course: Course) {
    if (finalizedCountry && course.country && course.country !== finalizedCountry) {
      setConfirmCourse(course)
      return
    }
    // One campus is assigned by the server; several have to be chosen, because the offer will
    // name one and an application that does not say which is an incomplete record.
    if ((course.campuses?.length ?? 0) > 1) {
      setCampusCourse(course)
      return
    }
    add(course)
  }

  function handlePick(id: string) {
    setPickedId(id)
    const course = availableCourses.find((c) => c.id === id)
    if (course) selectCourse(course)
  }

  if (campusCourse) {
    const campuses = campusCourse.campuses ?? []
    return (
      <Modal
        onClose={onClose}
        title="Which campus?"
        widthRem={26}
        footer={
          <>
            {addCollege.isError && (
              <p className="mr-auto self-center text-body-sm text-error">{addCollege.error.message}</p>
            )}
            <Button
              variant="secondary"
              onClick={() => {
                setCampusCourse(null)
                setPickedId('')
              }}
            >
              Back
            </Button>
          </>
        }
      >
        <p className="mb-md text-body-sm text-text-secondary">
          {campusCourse.name} runs at {campuses.length} campuses. The offer will name one, so the
          application records which.
        </p>
        <div className="flex flex-col gap-sm">
          {campuses.map((campus) => (
            <Button
              key={campus.id}
              variant="secondary"
              loading={addCollege.isPending}
              onClick={() => add(campusCourse, campus.id)}
            >
              {[campus.city, campus.province_state, campus.country].filter(Boolean).join(', ')}
            </Button>
          ))}
        </div>
      </Modal>
    )
  }

  if (confirmCourse) {
    return (
      <Modal
        onClose={onClose}
        title="Different Country"
        widthRem={28}
        footer={
          <>
            <Button
              variant="secondary"
              onClick={() => {
                setConfirmCourse(null)
                setPickedId('')
              }}
            >
              Back
            </Button>
            <Button
              loading={addCollege.isPending}
              onClick={() =>
                (confirmCourse.campuses?.length ?? 0) > 1
                  ? (setCampusCourse(confirmCourse), setConfirmCourse(null))
                  : addCollege.mutate(
                  { course_id: confirmCourse.id },
                  {
                    onSuccess: () => {
                      showToast(`${confirmCourse.name} added`)
                      onClose()
                    },
                  },
                )
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
        <SearchSelect
          id="add-college-course"
          options={availableCourses.map((course) => ({
            id: course.id,
            label: course.name,
            sublabel: course.college_name + (course.country ? ` · ${course.country}` : ''),
          }))}
          value={pickedId}
          onChange={handlePick}
          placeholder="Search courses or colleges…"
          disabled={courses.isLoading || addCollege.isPending}
        />
        {courses.isLoading && <p className="text-body-sm text-text-secondary">Loading…</p>}
        {!courses.isLoading && availableCourses.length === 0 && (
          <p className="text-body-sm text-text-secondary">
            {takenCourseIds.length > 0 ? 'Every matching course is already on this journey.' : 'No courses available.'}
          </p>
        )}
        {addCollege.isError && <p className="text-body-sm text-error">{addCollege.error.message}</p>}
      </div>
    </Modal>
  )
}
