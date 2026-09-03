import { useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import { AppShell } from '@/features/auth/AppShell'
import { Card } from '@/components/Card'
import { Button } from '@/components/Button'
import { TextField } from '@/components/TextField'
import { ErrorState, Skeleton } from '@/components/QueryState'
import { useClient, useReopenPlan } from '@/queries/clients'
import { usePlan } from '@/queries/plans'
import { useFeature } from '@/lib/features'
import { usePermission } from '@/lib/permissions'
import { CloseClientModal } from './CloseClientModal'
import { ReopenClientModal } from './ReopenClientModal'
import { OverviewTab } from './ClientProfileOverviewTab'
import { PlanTab } from './ClientProfilePlanTab'
import { CommissionsTab } from './ClientProfileCommissionsTab'
import { SelectedCollegesTab } from './ClientProfileSelectedCollegesTab'
import { DocumentsTab } from './ClientProfileDocumentsTab'
import { InternalNotesTab } from './ClientProfileInternalNotesTab'
import { ActivityTab } from './ClientProfileActivityTab'
import { FormsTab } from './ClientProfileFormsTab'

const TABS = [
  'Overview',
  'Plan',
  'Forms',
  'Commissions',
  'Selected Colleges',
  'Documents',
  'Internal Notes',
  'Activity',
] as const
type Tab = (typeof TABS)[number]

export function ClientProfilePage() {
  const { id = '' } = useParams()
  // Deep-link support (user-requested, 2026-08-19 — Activity's Step Approvals row redirects here
  // "to client plan tab and to the specific step"). Since T5 (third-pass review) the ACTIVE tab
  // lives in the URL, not component state: a refresh mid-review used to remount on Overview and
  // lose the consultant's place. `step` stays a mount-time read — the step selection inside
  // PlanStepBuilder is transient in a way the tab is not.
  const [searchParams, setSearchParams] = useSearchParams()
  const initialStepId = searchParams.get('step') ?? undefined
  const client = useClient(id)
  const plan = usePlan(id)
  const reopenPlan = useReopenPlan(id)
  // Reopening a completed plan is an elevated action — "defaulting to Consultancy Admin only,
  // delegable to trusted staff" (build reference §374). The permission key shipped with the
  // designation editor; the button never checked it until the contract audit (2026-08-23). Also
  // gated on the `case_reopening` entitlement (Business+) since 2026-08-29 — reopening a closed
  // lead/case/plan is a plan feature, not a Starter-core capability.
  const hasCaseReopening = useFeature('case_reopening')
  const canReopenPlan = usePermission('step_review.reopen_plan') && hasCaseReopening
  const canViewCommissions = usePermission('clients.view_commissions')
  const tabParam = searchParams.get('tab')
  const activeTab: Tab = (TABS as readonly string[]).includes(tabParam ?? '') ? (tabParam as Tab) : 'Overview'
  // replace, not push: tab flips shouldn't turn the Back button into a tour of every tab visited.
  function setActiveTab(tab: Tab) {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev)
        if (tab === 'Overview') next.delete('tab')
        else next.set('tab', tab)
        next.delete('step')
        return next
      },
      { replace: true },
    )
  }
  const [showReopen, setShowReopen] = useState(false)
  const [reopenReason, setReopenReason] = useState('')
  const [showCloseCase, setShowCloseCase] = useState(false)
  const [showReopenCase, setShowReopenCase] = useState(false)

  if (client.isLoading) {
    return (
      <AppShell>
        <Skeleton className="h-64 rounded-lg" />
      </AppShell>
    )
  }

  if (client.isError || !client.data) {
    return (
      <AppShell>
        <ErrorState message="Could not load this client." onRetry={() => client.refetch()} />
      </AppShell>
    )
  }

  const data = client.data
  // Was a raw role === 'consultancy_admin' check — swapped to the permission key so an employee
  // whose designation grants clients.view_commissions actually gets the tab (admins still pass
  // via the is_consultancy_admin bypass inside the checker).
  const canSeeCommissions = canViewCommissions
  // Close Case is Starter core (build reference 1.16 made real, 2026-08-29 — hygiene, symmetric
  // with Close Lead) and stays open on every plan. Reopening a closed case is the
  // `case_reopening` entitlement, same flag as Reopen Plan above.
  // Forms tab only appears once the plan actually has something to show (user-requested,
  // 2026-08-19 — "if there are any forms linked to the plan involved, then show the forms") —
  // same cached query PlanTab itself uses, so this doesn't add a second fetch.
  const hasLinkedForms = (plan.data?.steps ?? []).some((step) => step.components.some((c) => c.type === 'form_link'))
  const visibleTabs = TABS.filter((tab) => {
    if (tab === 'Commissions') return canSeeCommissions
    if (tab === 'Selected Colleges') return data.case_type === 'student'
    if (tab === 'Forms') return hasLinkedForms
    return true
  })

  return (
    <AppShell>
      <div className="flex flex-col gap-lg">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-sm">
            <Link
              to="/clients"
              aria-label="Back to Clients"
              title="Back to Clients"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-text-secondary hover:bg-background hover:text-text-primary"
            >
              <ArrowLeft className="h-5 w-5" />
            </Link>
            <div>
              <h1 className="text-h1 text-text-primary">
                {data.student.first_name} {data.student.last_name}
                {data.file_number && (
                  <span className="ml-sm text-body-sm font-normal text-text-secondary">{data.file_number}</span>
                )}
              </h1>
              <p className="text-body-sm text-text-secondary">{data.status.replace(/_/g, ' ')}</p>
            </div>
          </div>
          <div className="flex gap-sm">
            <Link to={`/clients/${id}/conversation`}>
              <Button variant="secondary">Conversation</Button>
            </Link>
            {canReopenPlan && data.status === 'plan_complete' && (
              <Button variant="secondary" onClick={() => setShowReopen((v) => !v)}>
                Reopen Plan
              </Button>
            )}
            {data.status === 'closed' ? (
              hasCaseReopening && (
                <Button variant="secondary" onClick={() => setShowReopenCase(true)}>
                  Reopen Case
                </Button>
              )
            ) : (
              <Button variant="destructive" onClick={() => setShowCloseCase(true)}>
                Close Case
              </Button>
            )}
          </div>
        </div>

        {showCloseCase && (
          <CloseClientModal
            clientId={id}
            clientName={`${data.student.first_name} ${data.student.last_name}`}
            onClose={() => setShowCloseCase(false)}
          />
        )}
        {showReopenCase && (
          <ReopenClientModal
            clientId={id}
            clientName={`${data.student.first_name} ${data.student.last_name}`}
            onClose={() => setShowReopenCase(false)}
          />
        )}

        {showReopen && (
          <Card className="flex items-end gap-sm">
            <TextField
              label="Reason (mandatory)"
              value={reopenReason}
              onChange={(e) => setReopenReason(e.target.value)}
              className="flex-1"
            />
            <Button
              variant="destructive"
              disabled={!reopenReason}
              loading={reopenPlan.isPending}
              onClick={() =>
                reopenPlan.mutate(reopenReason, {
                  onSuccess: () => {
                    setShowReopen(false)
                    setReopenReason('')
                  },
                })
              }
            >
              Confirm Reopen
            </Button>
          </Card>
        )}

        <div className="flex gap-xs overflow-x-auto border-b border-border">
          {visibleTabs.map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`shrink-0 border-b-2 px-md py-sm text-body-sm ${
                activeTab === tab ? 'border-primary font-medium text-primary' : 'border-transparent text-text-secondary'
              }`}
            >
              {tab}
            </button>
          ))}
        </div>

        {activeTab === 'Overview' && <OverviewTab clientId={id} onViewPlan={() => setActiveTab('Plan')} />}
        {activeTab === 'Plan' && <PlanTab clientId={id} initialStepId={initialStepId} />}
        {activeTab === 'Forms' && hasLinkedForms && <FormsTab clientId={id} />}
        {activeTab === 'Commissions' && canSeeCommissions && <CommissionsTab clientId={id} />}
        {activeTab === 'Selected Colleges' && <SelectedCollegesTab clientId={id} />}
        {activeTab === 'Documents' && <DocumentsTab clientId={id} />}
        {activeTab === 'Internal Notes' && <InternalNotesTab clientId={id} />}
        {activeTab === 'Activity' && <ActivityTab clientId={id} />}
      </div>
    </AppShell>
  )
}
