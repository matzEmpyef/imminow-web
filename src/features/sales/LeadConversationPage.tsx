import { useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, PictureInPicture2 } from 'lucide-react'
import { AppShell } from '@/features/auth/AppShell'
import { Card } from '@/components/Card'
import { ErrorState, Skeleton } from '@/components/QueryState'
import { Badge } from '@/components/Badge'
import { Button } from '@/components/Button'
import { Modal } from '@/components/Modal'
import { ChatPanel } from '@/components/ChatPanel'
import { AssignBranchMenu } from '@/components/AssignBranchMenu'
import { StudentProfileFields } from '@/components/StudentProfileFields'
import { useChatWindowStore } from '@/stores/chatWindowStore'
import { SetReminderModal } from './SetReminderModal'
import { RequestRatingModal } from './RequestRatingModal'
import { ConvertToClientModal } from './ConvertToClientModal'
import { CloseLeadModal } from './CloseLeadModal'
import { ReopenLeadModal } from './ReopenLeadModal'
import {
  useAddLeadNote,
  useLead,
  useLeadMessages,
  useLeadNotes,
  useMarkLeadRead,
  useRequestShortlist,
  useRespondToConversion,
  useSendLeadMessage,
  useSetLeadBranch,
} from '@/queries/leads'
import { useBranches } from '@/queries/staff'
import { useFeature } from '@/lib/features'
import { formatDate, formatDateTime } from '@/lib/time'
import { formatMoney } from '@/lib/money'
import type { components } from '@/api/schema'

type LeadMessage = components['schemas']['LeadMessage']
type ConversionProposal = components['schemas']['ConversionProposal']

// User-asked (2026-08-19) — "student can also initiate a Convert to client." Whichever side did
// *not* initiate is the one who approves/declines; consultant-initiated proposals still show
// the old "awaiting response" pill (there's nothing for the consultant to action until the
// student responds — and that side genuinely can't happen in this codebase, no student login
// exists), while a student-initiated one shows real Approve/Decline buttons. Navigates straight
// to the new Client Profile on approval rather than leaving the consultant on the now-closed
// lead.
function ConversionApprovalActions({
  leadId,
  leadName,
  proposal,
}: {
  leadId: string
  leadName: string
  proposal: ConversionProposal
}) {
  const navigate = useNavigate()
  const respond = useRespondToConversion(leadId)

  if (proposal.initiated_by !== 'student') {
    return (
      <div className="rounded-full bg-background px-sm py-1.5 text-caption text-text-secondary">
        Awaiting {leadName}'s response — expires {formatDate(proposal.expires_at)}
      </div>
    )
  }

  return (
    <div className="flex items-center gap-sm rounded-md border border-primary bg-primary-subtle px-sm py-1.5">
      <span className="text-caption font-medium text-primary">{leadName} wants to become a client</span>
      {respond.isError && <p className="text-caption text-error">{respond.error.message}</p>}
      <Button
        loading={respond.isPending && respond.variables?.decision === 'approved'}
        onClick={() =>
          respond.mutate(
            { proposalId: proposal.id, decision: 'approved' },
            { onSuccess: (data) => data.client_id && navigate(`/clients/${data.client_id}`) },
          )
        }
      >
        Approve
      </Button>
      <Button
        variant="secondary"
        loading={respond.isPending && respond.variables?.decision === 'declined'}
        onClick={() => respond.mutate({ proposalId: proposal.id, decision: 'declined' })}
      >
        Decline
      </Button>
    </div>
  )
}

// User-requested (2026-08-19) — "a button in lead's detail page, request for shortlist courses
// (if not already shared).. when clicking a message is send to lead, lead clicks and the
// shortlisted courses is shared (in the same place button to view the courses)." State is
// derived from whichever of shortlist_request/shortlist_share appears most recently in the
// thread — no separate stored flag, so it can never drift out of sync with the actual messages.
function shortlistState(messages: LeadMessage[] | undefined): 'none' | 'requested' | 'shared' {
  if (!messages) return 'none'
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].type === 'shortlist_share') return 'shared'
    if (messages[i].type === 'shortlist_request') return 'requested'
  }
  return 'none'
}

function ShortlistViewModal({ messages, onClose }: { messages: LeadMessage[] | undefined; onClose: () => void }) {
  const lastShare = [...(messages ?? [])].reverse().find((m) => m.type === 'shortlist_share')
  const courses = lastShare?.shared_courses ?? []
  return (
    <Modal onClose={onClose} title="Shortlisted Courses" widthRem={28}>
      <div className="flex flex-col gap-xs">
        {courses.length === 0 && <p className="text-body-sm text-text-secondary">No courses shared yet.</p>}
        {courses.map((course) => (
          <div key={course.id} className="rounded-md border border-border p-sm">
            <p className="text-body-sm font-medium text-text-primary">{course.name}</p>
            <p className="text-caption text-text-secondary">
              {course.college_name}
              {course.country ? ` · ${course.country}` : ''}
              {course.fee?.amount ? ` · ${formatMoney(course.fee.currency, course.fee.amount)}` : ''}
            </p>
          </div>
        ))}
      </div>
    </Modal>
  )
}

// The lead's own routing/engagement facts — NEVER phone or email (user, 2026-08-23: "In the
// leads details page we need to show the leads details except contact information"). Status,
// Last message, and Awaiting reply were all dropped (user, 2026-08-24: "no need to show status,
// last message" / "in details do not show Awaiting reply") — status already shows as the header
// pill this page already has, Last message duplicates what the chat panel right beside this card
// makes obvious, and Awaiting reply is exactly that same pill's own meaning restated.
//
// The card that used to sit below this one (name + study preferences) is gone entirely
// (2026-08-24: "no need of second card after details card, since it is already there in Details
// app profile popup") — everything it showed, "View study preference" below now shows too, in
// the SAME shared component Course Finder's popups use, so there is exactly one place this data
// is rendered rather than two slightly different ones. ("App profile" → "Study preference" is a
// pure rename, 2026-08-24 — same button, same popup, same data.)
//
// Deliberately read-only aside from Branch: tags are already editable from the Active Leads row
// menu, and adding a second place to edit them here would just be two sources of truth for one
// thing. Branch's own trigger is text ("Change"), not `AssignBranchMenu`'s usual icon — this row
// already carries a text label, so a second icon added nothing (user: "in Branch no need of
// icon"); other consumers of that component still use the icon, unchanged.
// C1: matches ImportLeadsModal's Source dropdown labels — walk_in needs the hyphen, the rest
// already read fine title-cased.
const SOURCE_LABELS: Record<string, string> = {
  referral: 'Referral',
  website: 'Website',
  walk_in: 'Walk-in',
  social: 'Social',
  other: 'Other',
}

function DetailsCard({ lead }: { lead: NonNullable<ReturnType<typeof useLead>['data']> }) {
  const branches = useBranches()
  const setLeadBranch = useSetLeadBranch()
  const multiBranch = (branches.data?.length ?? 0) > 1
  const [showProfile, setShowProfile] = useState(false)

  return (
    <Card>
      <div className="flex items-center justify-between">
        <h2 className="text-h3 text-text-primary">Details</h2>
        {/* The lead's own Sentpo app profile — everything StudentProfileFields shows on the
            Course Finder popups, reused here rather than re-describing the same fields a second
            way (user, 2026-08-24: "have a button where details from the client app profile is
            displayed"). Imported leads have no app account to show. */}
        {lead.origin === 'sentpo' && (
          <button
            type="button"
            onClick={() => setShowProfile(true)}
            className="text-body-sm text-primary hover:underline"
          >
            View study preference
          </button>
        )}
      </div>
      <dl className="mt-sm flex flex-col gap-xs text-body-sm">
        {lead.origin === 'imported' && lead.source && (
          <div className="flex justify-between">
            <dt className="text-text-secondary">Source</dt>
            <dd className="text-text-primary">{SOURCE_LABELS[lead.source] ?? lead.source}</dd>
          </div>
        )}
        {lead.assigned_employee_name && (
          <div className="flex justify-between">
            <dt className="text-text-secondary">Assigned to</dt>
            <dd className="text-text-primary">{lead.assigned_employee_name}</dd>
          </div>
        )}
        {multiBranch && (
          <div className="flex items-center justify-between">
            <dt className="text-text-secondary">Branch</dt>
            <dd className="flex items-center gap-xs">
              <span className="text-text-primary">
                {branches.data?.find((b) => b.id === lead.branch_id)?.name ?? 'Unassigned'}
              </span>
              <AssignBranchMenu
                branches={(branches.data ?? []).map((b) => ({ id: b.id!, name: b.name }))}
                currentBranchId={lead.branch_id}
                onSelect={(branchId) => setLeadBranch.mutate({ id: lead.id, branchId })}
                label={`Set branch for ${lead.name}`}
                description="Choose which branch this lead should be mapped to."
                iconOnly={false}
              />
            </dd>
          </div>
        )}
        {lead.tags && lead.tags.length > 0 && (
          <div className="flex justify-between gap-md">
            <dt className="shrink-0 text-text-secondary">Tags</dt>
            <dd className="flex flex-wrap justify-end gap-xs">
              {lead.tags.map((tag) => (
                <Badge key={tag} color="secondary">
                  {tag}
                </Badge>
              ))}
            </dd>
          </div>
        )}
        <div className="flex justify-between">
          <dt className="text-text-secondary">Added</dt>
          <dd className="text-text-primary">{formatDate(lead.created_at)}</dd>
        </div>
      </dl>

      {showProfile && (
        <Modal onClose={() => setShowProfile(false)} title={`${lead.name} — Study preference`} widthRem={30}>
          <StudentProfileFields prefs={lead.preferences} />
        </Modal>
      )}
    </Card>
  )
}

function NotesCard({ leadId }: { leadId: string }) {
  const notes = useLeadNotes(leadId)
  const addNote = useAddLeadNote(leadId)
  const [draft, setDraft] = useState('')

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!draft.trim()) return
    addNote.mutate(draft, { onSuccess: () => setDraft('') })
  }

  return (
    <Card className="flex flex-col gap-md">
      <h2 className="text-h3 text-text-primary">Notes</h2>
      <form onSubmit={handleSubmit} className="flex gap-sm">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Add a note for the team…"
          className="h-10 flex-1 rounded-md border border-border bg-surface px-3 text-body"
        />
        <Button type="submit" loading={addNote.isPending}>
          Add
        </Button>
      </form>
      <div className="flex flex-col gap-sm">
        {notes.data?.length === 0 && <p className="text-body-sm text-text-secondary">No notes yet.</p>}
        {notes.data?.map((note) => (
          <div key={note.id} className="border-b border-border pb-sm last:border-0">
            <p className="text-body-sm text-text-primary">{note.content}</p>
            <p className="text-caption text-text-secondary">
              {note.author.first_name} {note.author.last_name} · {formatDateTime(note.created_at)}
            </p>
          </div>
        ))}
      </div>
    </Card>
  )
}

export function LeadConversationPage() {
  const { id = '' } = useParams()
  const lead = useLead(id)
  const messages = useLeadMessages(id)
  const sendMessage = useSendLeadMessage(id)
  const markRead = useMarkLeadRead()
  const requestShortlist = useRequestShortlist(id)
  const openFloating = useChatWindowStore((s) => s.open)
  const [draft, setDraft] = useState('')
  const [showReminderModal, setShowReminderModal] = useState(false)
  const [showRatingModal, setShowRatingModal] = useState(false)
  const [showConvertModal, setShowConvertModal] = useState(false)
  const [showCloseModal, setShowCloseModal] = useState(false)
  const [showReopenModal, setShowReopenModal] = useState(false)
  const [showShortlistView, setShowShortlistView] = useState(false)

  // Set Reminder is the `activity_queue` entitlement (Ultimate by default) — reminders feed the
  // Activity work-queue, so without that page there's nowhere for one to surface.
  const canSetReminder = useFeature('activity_queue')
  // Close Lead is Starter core (build reference 1.16 made real, 2026-08-29 — hygiene fix, it was
  // mis-gated Ultimate before) and stays open on every plan; `leads.close` (permissions.ts) gates
  // who inside an already-entitled consultancy can close (configurable via Designations/
  // Employees, not yet enforced here or server-side — matching every other granular Leads
  // permission in this codebase today; see PROGRESS.md). Reopen is the `case_reopening`
  // entitlement, same flag as Reopen Case/Reopen Plan on the client side.
  const canReopenLead = useFeature('case_reopening')

  useEffect(() => {
    if (id) markRead.mutate(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mutate() is stable, id is the real trigger
  }, [id])

  function handleSend(e: FormEvent) {
    e.preventDefault()
    if (!draft.trim()) return
    sendMessage.mutate(draft, { onSuccess: () => setDraft('') })
  }

  if (lead.isLoading) {
    return (
      <AppShell>
        <Skeleton className="h-64 rounded-md" />
      </AppShell>
    )
  }

  if (lead.isError || !lead.data) {
    return (
      <AppShell>
        <ErrorState message="Could not load this lead." onRetry={() => lead.refetch()} />
      </AppShell>
    )
  }

  const data = lead.data

  return (
    <AppShell>
      <div className="flex h-full min-h-0 flex-col gap-md">
        <div className="flex shrink-0 flex-wrap items-center justify-between gap-md">
          <div className="flex min-w-0 items-center gap-sm">
            <Link
              to="/sales/active-leads"
              aria-label="Back to Active Leads"
              title="Back to Active Leads"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-text-secondary hover:bg-background hover:text-text-primary"
            >
              <ArrowLeft className="h-5 w-5" />
            </Link>
            <h1 className="truncate text-h1 text-text-primary">{data.name}</h1>
          </div>

          <div className="flex shrink-0 items-center gap-sm">
            {data.status === 'closed' ? (
              <>
                <span className="rounded-full bg-background px-sm py-1.5 text-caption font-medium text-text-secondary">
                  Closed
                </span>
                {canReopenLead && (
                  <Button variant="secondary" onClick={() => setShowReopenModal(true)}>
                    Reopen Lead
                  </Button>
                )}
              </>
            ) : (
              <>
                {canSetReminder && (
                  <Button variant="secondary" onClick={() => setShowReminderModal(true)}>
                    Set Reminder
                  </Button>
                )}

                {data.origin === 'sentpo' && (
                  <Button
                    variant="secondary"
                    disabled={!data.can_request_rating}
                    onClick={() => setShowRatingModal(true)}
                  >
                    {data.can_request_rating ? 'Request a Rating' : 'Rating requested recently'}
                  </Button>
                )}

                {(() => {
                  const state = shortlistState(messages.data?.items)
                  return state === 'shared' ? (
                    <Button variant="secondary" onClick={() => setShowShortlistView(true)}>
                      View Shortlist
                    </Button>
                  ) : (
                    <Button
                      variant="secondary"
                      disabled={state === 'requested'}
                      loading={requestShortlist.isPending}
                      onClick={() => requestShortlist.mutate()}
                    >
                      {state === 'requested' ? 'Shortlist Requested' : 'Request Shortlist'}
                    </Button>
                  )
                })()}

                {data.active_proposal ? (
                  <ConversionApprovalActions leadId={id} leadName={data.name} proposal={data.active_proposal} />
                ) : (
                  <Button onClick={() => setShowConvertModal(true)}>Convert to Client</Button>
                )}

                <Button variant="destructive" onClick={() => setShowCloseModal(true)}>
                  Close Lead
                </Button>
              </>
            )}
          </div>
        </div>

        {showReminderModal && <SetReminderModal leadId={id} onClose={() => setShowReminderModal(false)} />}
        {showRatingModal && (
          <RequestRatingModal leadId={id} leadName={data.name} onClose={() => setShowRatingModal(false)} />
        )}
        {showConvertModal && (
          <ConvertToClientModal leadId={id} leadName={data.name} onClose={() => setShowConvertModal(false)} />
        )}
        {showCloseModal && <CloseLeadModal leadId={id} leadName={data.name} onClose={() => setShowCloseModal(false)} />}
        {showReopenModal && (
          <ReopenLeadModal leadId={id} leadName={data.name} onClose={() => setShowReopenModal(false)} />
        )}
        {showShortlistView && (
          <ShortlistViewModal messages={messages.data?.items} onClose={() => setShowShortlistView(false)} />
        )}

        <div className="grid min-h-0 flex-1 grid-cols-3 gap-lg">
          <div className="col-span-2 flex min-h-0 flex-col">
            <ChatPanel
              name={data.name}
              typeLabel="Aspirant"
              typeLabelTone="primary"
              messages={messages.data?.items?.map((m) => ({
                ...m,
                fromMe: m.sender === 'consultant',
                sharedCourses: m.shared_courses,
                sharedCollege: m.shared_college,
                sharedCourse: m.shared_course,
                fitSummary: m.fit_summary,
                visitRequest: m.visit_request,
                isCallInitiated: m.type === 'call_initiated',
              }))}
              isLoading={messages.isLoading}
              isError={messages.isError}
              onRetryMessages={() => messages.refetch()}
              draft={draft}
              onDraftChange={setDraft}
              onSend={handleSend}
              sending={sendMessage.isPending}
              heightClassName="h-full"
              headerActions={
                <button
                  onClick={() => openFloating({ id, type: 'lead', name: data.name })}
                  aria-label="Open as floating window"
                  title="Open as floating window"
                  className="flex h-7 w-7 items-center justify-center rounded-md text-text-secondary hover:bg-background hover:text-text-primary"
                >
                  <PictureInPicture2 className="h-4 w-4" />
                </button>
              }
            />
          </div>

          <div className="flex flex-col gap-md overflow-y-auto">
            <DetailsCard lead={data} />
            <NotesCard leadId={id} />
          </div>
        </div>
      </div>
    </AppShell>
  )
}
