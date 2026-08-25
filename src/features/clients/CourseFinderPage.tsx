import { useState } from 'react'
import { ListChecks } from 'lucide-react'
import { AppShell } from '@/features/auth/AppShell'
import { Button } from '@/components/Button'
import { Table } from '@/components/Table'
import { CollegeDetailModal } from './CollegeDetailModal'
import { CourseDetailModal } from './CourseDetailModal'
import { ClientDetailModal } from './ClientDetailModal'
import { LeadDetailModal } from './LeadDetailModal'
import { CourseFinderFilters } from './CourseFinderFilters'
import { CourseFinderNotesDrawer } from './CourseFinderNotesDrawer'
import { CourseFinderSuggestModal } from './CourseFinderSuggestModal'
import { buildCourseFinderColumns } from './CourseFinderColumns'
import { useCourseFinderState, type SelectedPerson } from './courseFinderState'
import { useSelectedColleges, useAddSelectedCollege } from '@/queries/clients'
import { useSuggestCourseToLead, useLeadMessages } from '@/queries/leads'
import { usePersonPicker } from '@/lib/usePersonPicker'
import { useCourseFinder } from '@/queries/courseFinder'
import { useCollegeDetail } from '@/queries/adminColleges'
import type { components } from '@/api/schema'

type Course = components['schemas']['Course']

// Consultant Course Finder — COURSES_MODULE_PLAN.md §4.1 (workstream D). Pick an applicant,
// search the catalog with each row's Grade Match evaluated against THAT applicant's profile
// (server-side eligibility_for decoration), and suggest courses straight onto their Selected
// Colleges tab. FACT-WORDING ONLY (plan §0.3): badges state requirements met/not met, never
// admission chances.
//
// Decomposed 2026-08-25 (frontend re-audit: this was one ~600-line component body). The page is
// now pure wiring: state machine in courseFinderState.ts, filter Card in CourseFinderFilters,
// columns in CourseFinderColumns, drawer/confirm-modal in their own files.
export function CourseFinderPage() {
  // Shared with AssignTaskModal.tsx via usePersonPicker() (2026-08-24) — see that hook's own
  // comment for why this moved out of being two separate copies.
  const { clientRows, leadRows } = usePersonPicker()
  const { state, setState, shortlist, setShortlist, drawerOpen, setDrawerOpen, handlePersonChange, toggleShortlist } =
    useCourseFinderState(clientRows, leadRows)

  const [collegeDetailId, setCollegeDetailId] = useState<string | null>(null)
  // The full row object goes straight into state (unlike college, which needs its own fetch) —
  // `courses.data.items` already carries every field, the table just doesn't render all of them
  // (user, 2026-08-24: "we need course details too").
  const [courseDetail, setCourseDetail] = useState<Course | null>(null)
  // "Open ...'s profile" used to navigate away to the full Client Profile page (user, 2026-08-24:
  // "we want to see only the details of the client — don't go to page, just show it in the
  // popup"), then extended to leads too. Each popup shows the profile fields relevant to picking
  // a college/course, not a general case summary, with a link to the real page for everything else.
  const [showClientDetail, setShowClientDetail] = useState(false)
  const [showLeadDetail, setShowLeadDetail] = useState(false)
  const [confirmSuggest, setConfirmSuggest] = useState<{ id: string; name: string } | null>(null)

  const selectedClient = state.personKind === 'client' ? clientRows.find((c) => c.id === state.personId) : undefined
  const selectedLead = state.personKind === 'lead' ? leadRows.find((l) => l.id === state.personId) : undefined
  const selectedPerson: SelectedPerson = selectedClient
    ? { id: selectedClient.id!, kind: 'client' }
    : selectedLead
      ? { id: selectedLead.id, kind: 'lead' }
      : null

  const feeMaxInr = state.feeMaxLakh ? Math.round(Number(state.feeMaxLakh) * 100000) : undefined
  const courses = useCourseFinder({
    personId: state.personId,
    search: state.search || undefined,
    country: state.country || undefined,
    level: state.level || undefined,
    fieldOfStudy: state.fieldOfStudy || undefined,
    feeMaxInr: Number.isFinite(feeMaxInr) ? feeMaxInr : undefined,
    sort: state.sort || undefined,
  })

  // Client-side "already suggested" tracking, one mechanism per audience since they are backed
  // by different things: a client's suggestions are `selected_colleges` rows; a lead's are
  // `course_share` messages in their own thread (there is no journey for a lead to attach a row
  // to — see `POST /leads/{id}/suggest-course`'s doc comment). Each hook is a no-op unless that
  // kind of person is actually selected.
  const selectedColleges = useSelectedColleges(selectedClient?.id)
  const addSelected = useAddSelectedCollege(selectedClient?.id ?? '')
  const leadMessages = useLeadMessages(selectedLead?.id)
  const suggestToLead = useSuggestCourseToLead(selectedLead?.id ?? '')
  const suggestedCourseIds = new Set(
    (selectedClient
      ? (selectedColleges.data ?? []).map((sc) => sc.course?.id)
      : (leadMessages.data?.items ?? [])
          .filter((m) => m.type === 'course_share' && m.sender === 'consultant')
          .map((m) => m.shared_course?.id)
    ).filter((id): id is string => Boolean(id)),
  )

  function suggestCourse(courseId: string) {
    if (selectedClient) addSelected.mutate({ course_id: courseId, status: 'considering' })
    else if (selectedLead) suggestToLead.mutate(courseId)
  }
  const suggestPending = selectedClient ? addSelected.isPending : suggestToLead.isPending
  const suggestingId = selectedClient ? addSelected.variables?.course_id : suggestToLead.variables

  const allRows = courses.data?.items ?? []
  // "Eligible only" default ON for consultants (plan §4.1) — the one place hiding is allowed,
  // because it's an explicit, visible toggle the consultant controls, never a silent filter.
  // Unknown/incomplete fits stay visible either way; only a hard `below` verdict is hidden.
  const rows = state.eligibleOnly ? allRows.filter((c) => c.fit?.verdict !== 'below') : allRows
  const hiddenCount = allRows.length - rows.length
  // Grade Match only exists relative to a PERSON WITH A PROFILE. An imported lead has no linked
  // student account and the server sends no `fit` at all for one (see useCourseFinder) — showing
  // the column anyway would print "No requirements published" on every row, which is the WRONG
  // reason (the course may have requirements; there is simply nobody to check them against).
  const canCheckFit = Boolean(selectedClient) || (selectedLead?.origin === 'sentpo' && Boolean(selectedLead.student_id))

  const personLabel = selectedClient
    ? `${selectedClient.student.first_name} ${selectedClient.student.last_name}`
    : selectedLead?.name

  const columns = buildCourseFinderColumns({
    canCheckFit,
    selectedPerson,
    shortlist,
    suggestedCourseIds,
    suggestPending,
    suggestingId,
    onToggleShortlist: toggleShortlist,
    onSuggest: setConfirmSuggest,
    onOpenCourse: setCourseDetail,
    onOpenCollege: setCollegeDetailId,
  })

  return (
    <AppShell>
      <div className="flex flex-col gap-lg">
        <div className="flex items-center justify-between">
          <h1 className="text-h1 text-text-primary">Course Finder</h1>
          <div className="flex items-center gap-md">
            {selectedPerson && (
              // `Button`'s own base classes have no `display: flex` at all — harmless for every
              // other caller in the app (all plain text), but this is the one Button anywhere
              // with an icon AND text as children, so the icon sat baseline-aligned with the text
              // instead of centered against it (user, 2026-08-24). Fixed locally rather than on
              // the shared component, since nothing else needs it.
              <Button variant="secondary" onClick={() => setDrawerOpen(true)} className="flex items-center">
                <ListChecks className="mr-1 h-4 w-4" />
                Noted ({shortlist.length})
              </Button>
            )}
            {selectedClient && (
              <button
                type="button"
                onClick={() => setShowClientDetail(true)}
                className="text-body-sm text-primary hover:underline"
              >
                {selectedClient.student.first_name}&rsquo;s details
              </button>
            )}
            {selectedLead && (
              <button
                type="button"
                onClick={() => setShowLeadDetail(true)}
                className="text-body-sm text-primary hover:underline"
              >
                {selectedLead.name}&rsquo;s details
              </button>
            )}
          </div>
        </div>

        <CourseFinderFilters
          state={state}
          onChange={(patch) => setState((s) => ({ ...s, ...patch }))}
          clientRows={clientRows}
          leadRows={leadRows}
          onPersonChange={handlePersonChange}
          canCheckFit={canCheckFit}
          personName={selectedClient?.student.first_name ?? selectedLead?.name}
        />

        {/* The results are NOT gated on picking an applicant (user, 2026-08-23): "what if a
            consultant wants to search for courses for a lead... we do not want to share lead
            profile too". Without an applicant this is simply a catalog search; picking one
            layers Grade Match, notes and Suggest on top. */}
        <div className="flex flex-col gap-sm">
          {hiddenCount > 0 && (
            <p className="text-body-sm text-text-secondary">
              {hiddenCount} course{hiddenCount === 1 ? '' : 's'} below requirements hidden —{' '}
              <button
                type="button"
                className="text-primary hover:underline"
                onClick={() => setState((s) => ({ ...s, eligibleOnly: false }))}
              >
                show anyway
              </button>
            </p>
          )}
          <Table
            columns={columns}
            rows={rows}
            rowKey={(c) => c.id}
            loading={courses.isLoading}
            error={courses.isError ? 'Could not load courses.' : undefined}
            emptyMessage="No courses match these filters."
          />
        </div>

        <CourseFinderNotesDrawer
          open={drawerOpen}
          onClose={() => setDrawerOpen(false)}
          personLabel={personLabel}
          shortlist={shortlist}
          suggestedCourseIds={suggestedCourseIds}
          suggestPending={suggestPending}
          suggestingId={suggestingId}
          onSuggest={setConfirmSuggest}
          onRemove={(courseId) => setShortlist((list) => list.filter((e) => e.course_id !== courseId))}
        />

        {collegeDetailId && (
          <CollegeDetailModalById collegeId={collegeDetailId} onClose={() => setCollegeDetailId(null)} />
        )}
        {courseDetail && <CourseDetailModal course={courseDetail} onClose={() => setCourseDetail(null)} />}
        {showClientDetail && selectedClient && (
          <ClientDetailModal client={selectedClient} onClose={() => setShowClientDetail(false)} />
        )}
        {showLeadDetail && selectedLead && (
          <LeadDetailModal lead={selectedLead} onClose={() => setShowLeadDetail(false)} />
        )}

        {confirmSuggest && (
          <CourseFinderSuggestModal
            courseName={confirmSuggest.name}
            pending={suggestPending && suggestingId === confirmSuggest.id}
            onCancel={() => setConfirmSuggest(null)}
            onConfirm={() => {
              suggestCourse(confirmSuggest.id)
              setConfirmSuggest(null)
            }}
            destinationCopy={
              selectedClient ? (
                <>
                  {' '}
                  will be added to {selectedClient.student.first_name}&rsquo;s Selected Colleges, and they&rsquo;ll get
                  a notification pointing them at it.
                </>
              ) : selectedLead?.origin === 'sentpo' && selectedLead.student_id ? (
                <>
                  {' '}
                  will be sent as a message in {selectedLead.name}&rsquo;s chat, and they&rsquo;ll get a notification
                  pointing them at it.
                </>
              ) : (
                <> will be sent as a message in {selectedLead?.name}&rsquo;s chat.</>
              )
            }
          />
        )}
      </div>
    </AppShell>
  )
}

// Thin id→data wrapper so the click handler above can stay a plain string setter — CollegeDetailModal
// itself takes a loaded College, matching EventDetailsModal's own shape (caller already has the
// object in hand there; here it has to be fetched first).
function CollegeDetailModalById({ collegeId, onClose }: { collegeId: string; onClose: () => void }) {
  const college = useCollegeDetail(collegeId)
  if (!college.data) return null
  return <CollegeDetailModal college={college.data} onClose={onClose} />
}
