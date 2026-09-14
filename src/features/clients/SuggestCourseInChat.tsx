import { useState } from 'react'
import { GraduationCap } from 'lucide-react'
import { useQueryClient } from '@tanstack/react-query'
import { Modal } from '@/components/Modal'
import { Button } from '@/components/Button'
import { Badge } from '@/components/Badge'
import { TextField } from '@/components/TextField'
import { useCourseFinder } from '@/queries/courseFinder'
import { useLeadMessages, useSuggestCourseToLead } from '@/queries/leads'
import { useAddApplication, useApplications } from '@/queries/clients'
import { formatCourseFee } from '@/lib/money'
import { showToast } from '@/lib/toast'
import { FitCell } from './FitCell'
import { SuggestDestination } from './CourseFinderSuggestModal'
import type { components } from '@/api/schema'

type Course = components['schemas']['Course']

export interface ChatPerson {
  id: string
  kind: 'lead' | 'client'
  firstName: string
  // A Sentpo lead or a client can be notified and has a profile to check Grade Match against; a
  // lead a consultancy imported has neither.
  hasApp: boolean
}

// Suggest, from the chat box (2026-09-14). NOT a second feature: it calls exactly what Course
// Finder's Suggest calls — POST /leads/{id}/suggest-course for a lead, POST
// /clients/{id}/applications with message_student for a client — with the same confirmation
// wording. It only saves a trip to Course Finder when the consultant already knows the course.
export function SuggestCourseInChat({ person }: { person: ChatPerson }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Suggest a course"
        title="Suggest a course"
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-border text-text-secondary hover:bg-background hover:text-primary"
      >
        <GraduationCap className="h-5 w-5" />
      </button>
      {open && <SuggestCourseModal person={person} onClose={() => setOpen(false)} />}
    </>
  )
}

function SuggestCourseModal({ person, onClose }: { person: ChatPerson; onClose: () => void }) {
  const [search, setSearch] = useState('')
  const [picked, setPicked] = useState<Course | null>(null)
  const term = search.trim()
  const isLead = person.kind === 'lead'
  const courses = useCourseFinder({ personId: person.id, search: term || undefined }, term.length >= 2)
  const leadMessages = useLeadMessages(isLead ? person.id : undefined)
  const applications = useApplications(isLead ? undefined : person.id)
  const suggestToLead = useSuggestCourseToLead(isLead ? person.id : '')
  const addApplication = useAddApplication(isLead ? '' : person.id)
  const queryClient = useQueryClient()
  const pending = isLead ? suggestToLead.isPending : addApplication.isPending

  // Same "already suggested" rule as Course Finder: a lead's suggestions are course cards in their
  // thread, a client's are rows on their Applications tab.
  const suggestedIds = new Set(
    (isLead
      ? (leadMessages.data?.items ?? [])
          .filter((m) => m.type === 'course_share' && m.sender === 'consultant')
          .map((m) => m.shared_course?.id)
      : (applications.data ?? []).map((a) => a.course?.id)
    ).filter((id): id is string => Boolean(id)),
  )

  function confirm() {
    if (!picked) return
    const course = picked
    const callbacks = {
      onSuccess: () => {
        if (!isLead) queryClient.invalidateQueries({ queryKey: ['clients', person.id, 'messages'] })
        showToast(`Suggested ${course.name} to ${person.firstName}`)
        onClose()
      },
      onError: (error: Error) => showToast(error.message, 'error'),
    }
    if (isLead) suggestToLead.mutate(course.id, callbacks)
    else addApplication.mutate({ course_id: course.id, message_student: true }, callbacks)
  }

  if (picked) {
    return (
      <Modal
        onClose={onClose}
        title="Suggest this course?"
        footer={
          <div className="flex justify-end gap-sm">
            <Button variant="secondary" onClick={() => setPicked(null)}>
              Back
            </Button>
            <Button loading={pending} onClick={confirm}>
              Suggest
            </Button>
          </div>
        }
      >
        <p className="text-body-sm text-text-secondary">
          <span className="font-medium text-text-primary">{picked.name}</span>
          <SuggestDestination kind={person.kind} firstName={person.firstName} hasApp={person.hasApp} />
        </p>
      </Modal>
    )
  }

  const rows = (courses.data?.items ?? []).slice(0, 10)

  return (
    <Modal onClose={onClose} title="Suggest a course" widthRem={40}>
      <div className="flex flex-col gap-md">
        <TextField
          label="Course, college or field"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        {term.length < 2 ? (
          <p className="text-body-sm text-text-secondary">Type at least two letters to search your courses.</p>
        ) : courses.isLoading ? (
          <p className="text-body-sm text-text-secondary">Searching…</p>
        ) : courses.isError ? (
          <p className="text-body-sm text-error">Could not search courses.</p>
        ) : rows.length === 0 ? (
          <p className="text-body-sm text-text-secondary">No courses match “{term}”.</p>
        ) : (
          <ul className="flex flex-col divide-y divide-border">
            {rows.map((course) => {
              const already = suggestedIds.has(course.id)
              return (
                <li key={course.id} className="flex items-start justify-between gap-md py-sm">
                  <div className="flex min-w-0 flex-col gap-xs">
                    <span className="text-body-sm font-medium text-text-primary">{course.name}</span>
                    <span className="text-caption text-text-secondary">
                      {[course.college_name, course.country, formatCourseFee(course.fee, course.fee_period)]
                        .filter((part) => part && part !== '—')
                        .join(' · ')}
                    </span>
                    {person.hasApp && <FitCell fit={course.fit} />}
                  </div>
                  {already ? (
                    <Badge color="secondary">Suggested</Badge>
                  ) : (
                    <Button size="sm" variant="secondary" onClick={() => setPicked(course)}>
                      Suggest
                    </Button>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </Modal>
  )
}
