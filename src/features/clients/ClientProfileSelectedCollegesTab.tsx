// Split out of ClientProfilePage.tsx (Phase 3 plan, Tier B1, 2026-09-03) — pure movement, no logic change.
import { useState } from 'react'
import { Card } from '@/components/Card'
import { Button } from '@/components/Button'
import { Badge } from '@/components/Badge'
import { ErrorState, Skeleton } from '@/components/QueryState'
import { useClient, useSelectedColleges, useUpdateSelectedCollege } from '@/queries/clients'
import { formatMoney } from '@/lib/money'
import { AddSelectedCollegeModal } from './AddSelectedCollegeModal'
import { AcceptCollegeModal } from './AcceptCollegeModal'
import { RevertAcceptanceModal } from './RevertAcceptanceModal'

type SelectedCollegeRowData = import('@/api/schema').components['schemas']['SelectedCollege']

// FORWARD-ONLY lifecycle (user decision, 2026-08-28) — mirrors the server's transition map:
// one step at a time, rejected legal from applied or offer_received, accepted/rejected final
// (a wrong acceptance goes through the audited revert, never backward through the map).
// `suggested` is the birth status of every consultant add and has NO staff moves: only the
// student's own save to Dream Courses turns it into a selected college — this tab lists such
// rows as an awaiting count, never as selections.
type CollegeStatus = 'suggested' | 'considering' | 'applied' | 'offer_received' | 'accepted' | 'rejected'
const COLLEGE_STATUS_INFO: Record<
  CollegeStatus,
  { label: string; color: 'secondary' | 'info' | 'warning' | 'success' | 'error' }
> = {
  suggested: { label: 'Suggested — awaiting student', color: 'secondary' },
  considering: { label: 'Considering', color: 'secondary' },
  applied: { label: 'Applied', color: 'info' },
  offer_received: { label: 'Offer received', color: 'warning' },
  accepted: { label: 'Accepted', color: 'success' },
  rejected: { label: 'Rejected', color: 'error' },
}
const COLLEGE_NEXT_STEPS: Record<CollegeStatus, CollegeStatus[]> = {
  suggested: [],
  considering: ['applied'],
  applied: ['offer_received', 'rejected'],
  offer_received: ['accepted', 'rejected'],
  accepted: [],
  rejected: [],
}

export function SelectedCollegesTab({ clientId }: { clientId: string }) {
  const client = useClient(clientId)
  const colleges = useSelectedColleges(clientId)
  const updateStatus = useUpdateSelectedCollege(clientId)
  const [showAddCollege, setShowAddCollege] = useState(false)
  if (colleges.isLoading) return <Skeleton className="h-24 rounded-lg" />
  if (!colleges.data) {
    return <ErrorState message="Could not load selected colleges." onRetry={() => colleges.refetch()} />
  }

  const addCollegeButton = (
    <div className="flex justify-end">
      <Button variant="secondary" onClick={() => setShowAddCollege(true)}>
        Add College
      </Button>
    </div>
  )
  const addCollegeModal = showAddCollege && (
    <AddSelectedCollegeModal
      clientId={clientId}
      finalizedCountry={client.data?.finalized_country ?? null}
      takenCourseIds={colleges.data.map((sc) => sc.course.id)}
      onClose={() => setShowAddCollege(false)}
    />
  )

  // A suggestion is not a selection (user decision, 2026-08-28): rows the student has not yet
  // taken into their Dream Courses stay out of the list below — they show only as an awaiting
  // note, and nothing can be done to them from here.
  const awaiting = colleges.data.filter((sc) => sc.status === 'suggested')
  const selected = colleges.data.filter((sc) => sc.status !== 'suggested')

  const awaitingNote = awaiting.length > 0 && (
    <Card>
      <p className="text-body-sm font-medium text-text-primary">
        {awaiting.length === 1 ? '1 suggestion' : `${awaiting.length} suggestions`} awaiting the student
      </p>
      <p className="text-caption text-text-secondary">
        {awaiting.map((sc) => sc.course.name).join(', ')} — suggested courses become selected colleges once the student
        adds them to their Dream Courses.
      </p>
    </Card>
  )

  if (selected.length === 0) {
    return (
      <div className="flex flex-col gap-md">
        {addCollegeButton}
        {awaitingNote}
        <Card>
          <p className="text-body text-text-secondary">No colleges selected yet.</p>
        </Card>
        {addCollegeModal}
      </div>
    )
  }
  // User-requested (2026-08-19) — "if the country of the all the courses is not same them show
  // an alert in Selected Colleges tab (saying counties of courses are different)." Computed
  // entirely from `course.country` on each row already resolved server-side — no stored flag,
  // so it can never drift out of sync with the actual selection (covers both auto-transferred
  // shortlist courses from a conversion and manually added ones alike). Awaiting suggestions
  // are excluded — they are not selections yet, so they cannot contradict one.
  const selectedCountries = [...new Set(selected.map((sc) => sc.course.country).filter((c): c is string => Boolean(c)))]
  const countryMismatch = selectedCountries.length > 1

  return (
    <div className="flex flex-col gap-md">
      {addCollegeButton}
      {awaitingNote}
      {countryMismatch && (
        <Card className="border-warning bg-warning-subtle">
          <p className="text-body-sm font-medium text-warning">Countries of courses are different</p>
          <p className="text-caption text-text-secondary">
            Selected colleges span {selectedCountries.join(', ')} — worth confirming with the client which country
            they're actually applying to.
          </p>
        </Card>
      )}
      <div className="flex flex-col gap-xs">
        {selected.map((sc) => (
          <SelectedCollegeRow
            key={sc.id}
            clientId={clientId}
            row={sc}
            acceptedElsewhere={selected.find((o) => o.status === 'accepted' && o.id !== sc.id)?.course.name ?? null}
            journeyPayerMethod={client.data?.payer_method ?? null}
            onAdvance={(status) => updateStatus.mutate({ collegeId: sc.id, status })}
            advanceError={
              updateStatus.variables?.collegeId === sc.id && updateStatus.isError ? updateStatus.error.message : null
            }
            advancing={updateStatus.variables?.collegeId === sc.id && updateStatus.isPending}
          />
        ))}
      </div>
      {addCollegeModal}
    </div>
  )
}

// One college's row: status pill + only the moves the forward-only lifecycle allows from here.
// Accepting never fires directly — it opens the Accept popup, which is where the money
// agreement (and thus the commission entry) is captured. Rejecting is terminal, so it takes a
// second click to confirm rather than firing on the first.
function SelectedCollegeRow({
  clientId,
  row,
  acceptedElsewhere,
  journeyPayerMethod,
  onAdvance,
  advanceError,
  advancing,
}: {
  clientId: string
  row: SelectedCollegeRowData
  // The course name of ANOTHER row already accepted on this journey, if any. Accept can then
  // only ever 409 (single accepted case per student), so the button is not shown at all —
  // the UAT sweep (M4, 2026-08-29) caught the queue offering a click that could never work.
  acceptedElsewhere: string | null
  journeyPayerMethod: 'college' | 'applicant' | 'split' | null
  // `suggested` is not an advance target — the map never yields it, and the PATCH enum
  // rightly excludes it.
  onAdvance: (status: Exclude<CollegeStatus, 'suggested'>) => void
  advanceError: string | null
  advancing: boolean
}) {
  const [showAccept, setShowAccept] = useState(false)
  const [showRevert, setShowRevert] = useState(false)
  const [confirmReject, setConfirmReject] = useState(false)
  const status = row.status as CollegeStatus
  const info = COLLEGE_STATUS_INFO[status] ?? { label: row.status, color: 'secondary' as const }
  const nextSteps = COLLEGE_NEXT_STEPS[status] ?? []

  return (
    <Card className="flex flex-col gap-sm">
      <div className="flex items-center justify-between gap-md">
        <div>
          <p className="text-body font-medium text-text-primary">{row.course.name}</p>
          <p className="text-caption text-text-secondary">
            {row.course.college_name}
            {row.course.country ? ` · ${row.course.country}` : ''} ·{' '}
            {formatMoney(row.course.fee?.currency, row.course.fee?.amount)}
          </p>
        </div>
        <div className="flex items-center gap-sm">
          <Badge color={info.color}>{info.label}</Badge>
          {nextSteps.includes('applied') && (
            <Button size="sm" variant="secondary" onClick={() => onAdvance('applied')} loading={advancing}>
              Mark Applied
            </Button>
          )}
          {nextSteps.includes('offer_received') && (
            <Button size="sm" variant="secondary" onClick={() => onAdvance('offer_received')} loading={advancing}>
              Offer Received
            </Button>
          )}
          {nextSteps.includes('accepted') &&
            (acceptedElsewhere ? (
              <span
                className="text-caption text-text-secondary"
                title={`${acceptedElsewhere} is already accepted — revert that acceptance first to accept this one.`}
              >
                {acceptedElsewhere} accepted
              </span>
            ) : (
              <Button size="sm" onClick={() => setShowAccept(true)}>
                Accept…
              </Button>
            ))}
          {nextSteps.includes('rejected') &&
            (confirmReject ? (
              <>
                <Button size="sm" variant="destructive" onClick={() => onAdvance('rejected')} loading={advancing}>
                  Confirm Reject
                </Button>
                <Button size="sm" variant="secondary" onClick={() => setConfirmReject(false)}>
                  Keep
                </Button>
              </>
            ) : (
              <Button size="sm" variant="secondary" onClick={() => setConfirmReject(true)}>
                Rejected
              </Button>
            ))}
          {status === 'accepted' && (
            <Button size="sm" variant="secondary" onClick={() => setShowRevert(true)}>
              Change acceptance
            </Button>
          )}
        </div>
      </div>
      {advanceError && <p className="text-body-sm text-error">{advanceError}</p>}
      {showAccept && (
        <AcceptCollegeModal
          clientId={clientId}
          row={row}
          journeyPayerMethod={journeyPayerMethod}
          onClose={() => setShowAccept(false)}
        />
      )}
      {showRevert && (
        <RevertAcceptanceModal
          clientId={clientId}
          collegeId={row.id}
          courseName={row.course.name}
          onClose={() => setShowRevert(false)}
        />
      )}
    </Card>
  )
}
