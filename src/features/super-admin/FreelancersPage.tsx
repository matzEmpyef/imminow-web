import { useMemo, useState } from 'react'
import { AdminShell } from '@/features/auth/AdminShell'
import { Badge } from '@/components/Badge'
import { Button } from '@/components/Button'
import { CompactSelect } from '@/components/CompactSelect'
import { Card } from '@/components/Card'
import { Table, type TableColumn } from '@/components/Table'
import { Skeleton } from '@/components/QueryState'
import { formatDate } from '@/lib/time'
import { cursorPager, useCursorPagination } from '@/lib/pagination'
import { useAllFreelancers, useFreelancers, type Freelancer, type FreelancerStatus } from '@/queries/freelancerRates'
import { InviteFreelancerModal } from './freelancers/InviteFreelancerModal'
import { FreelancerDrawer } from './freelancers/FreelancerDrawer'
import { showToast } from '@/lib/toast'
import { inr } from '@/lib/money'

const STATUS_BADGE = {
  invited: { color: 'warning', label: 'Invited' },
  active: { color: 'success', label: 'Active' },
  deactivated: { color: 'secondary', label: 'Deactivated' },
} as const

function SummaryTiles({ freelancers }: { freelancers: Freelancer[] | undefined }) {
  // Still walking the roster: no numbers yet, rather than a page's worth passed off as the total.
  if (!freelancers) return <Skeleton className="h-24 rounded-lg" />
  const activeCount = freelancers.filter((f) => f.status === 'active' || (f.status == null && f.active !== false)).length
  const invitedCount = freelancers.filter((f) => f.status === 'invited').length
  // Overpaid freelancers (negative `owed`, gate 12) are not netted off what others are owed.
  const owedTotal = freelancers.reduce((sum, f) => sum + Math.max(0, f.owed_inr ?? 0), 0)
  const paidTotal = freelancers.reduce((sum, f) => sum + (f.paid_inr ?? 0), 0)

  return (
    <div className="grid grid-cols-2 gap-md sm:grid-cols-4">
      <Card>
        <p className="text-caption text-text-secondary">Active freelancers</p>
        <p className="text-h2 text-text-primary">{activeCount}</p>
      </Card>
      <Card>
        <p className="text-caption text-text-secondary">Invited (not joined yet)</p>
        <p className="text-h2 text-text-primary">{invitedCount}</p>
      </Card>
      <Card>
        <p className="text-caption text-text-secondary">Owed now</p>
        <p className={`text-h2 ${owedTotal > 0 ? 'text-warning' : 'text-text-primary'}`}>{inr(owedTotal)}</p>
      </Card>
      <Card>
        <p className="text-caption text-text-secondary">Paid so far</p>
        <p className="text-h2 text-text-primary">{inr(paidTotal)}</p>
      </Card>
    </div>
  )
}

/**
 * Freelancers, rebuilt 2026-09-11 on the richer /freelancers contract (typed referral codes,
 * status, and per-freelancer earned/paid/owed totals). Search and the status filter are the
 * server's, over every account (review F-154) —
 * everything account-specific (share editing, changing the code, resend, activation, the
 * freelancer's own referrals) moved into {@link FreelancerDrawer} so the row stays scannable.
 *
 * The separate Rates tab is gone (user, 2026-09-11): the roster shows each share and the drawer
 * sets or edits it, which was everything that tab did.
 */
export function FreelancersPage() {
  const paging = useCursorPagination()
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState<'' | FreelancerStatus>('')
  // Search and the status filter go to the server, which applies them over every account (review
  // F-154); they used to narrow only the page on screen.
  const freelancers = useFreelancers({ search: search.trim() || undefined, status: status || undefined }, paging.cursor)
  const pager = cursorPager(paging, freelancers.data?.meta)
  const rows = freelancers.data?.items ?? []
  // The tiles' totals are the whole roster's, whatever the list below is narrowed to, and the
  // drawer's lookup needs it too: every page walked, apart from the list's own page.
  const everyone = useAllFreelancers()
  const [viewingId, setViewingId] = useState<string | null>(null)
  const [inviting, setInviting] = useState(false)

  const viewingFreelancer = useMemo(
    () =>
      viewingId
        ? ((everyone.data ?? []).find((f) => f.id === viewingId) ??
          (freelancers.data?.items ?? []).find((f) => f.id === viewingId) ??
          null)
        : null,
    [viewingId, everyone.data, freelancers.data],
  )

  const columns: TableColumn<Freelancer>[] = [
    {
      key: 'name',
      header: 'Freelancer',
      render: (f) => (
        <div className="min-w-0">
          <p className="truncate font-medium text-text-primary">{f.name}</p>
          <p className="truncate text-body-sm text-text-secondary">{f.email}</p>
        </div>
      ),
    },
    {
      key: 'referral_code',
      header: 'Referral code',
      hideBelow: 'md',
      render: (f) => <span className="font-mono text-body-sm text-text-primary">{f.referral_code}</span>,
    },
    {
      key: 'status',
      header: 'Status',
      render: (f) => {
        const badge = STATUS_BADGE[f.status ?? (f.active !== false ? 'active' : 'deactivated')]
        return <Badge color={badge.color}>{badge.label}</Badge>
      },
    },
    {
      key: 'rate',
      header: 'Share',
      align: 'right',
      render: (f) => (f.rate != null ? <span className="tabular-nums text-text-primary">{f.rate}%</span> : <Badge color="warning">Not set</Badge>),
    },
    {
      key: 'referrals',
      header: 'Referrals',
      align: 'right',
      hideBelow: 'sm',
      render: (f) => <span className="tabular-nums text-text-primary">{f.referrals ?? 0}</span>,
    },
    {
      key: 'earned',
      header: 'Earned',
      align: 'right',
      hideBelow: 'lg',
      render: (f) => <span className="whitespace-nowrap tabular-nums text-text-primary">{inr(f.earned_inr)}</span>,
    },
    {
      key: 'paid',
      header: 'Paid',
      align: 'right',
      hideBelow: 'lg',
      render: (f) => <span className="whitespace-nowrap tabular-nums text-text-primary">{inr(f.paid_inr)}</span>,
    },
    {
      key: 'owed',
      header: 'Owed',
      align: 'right',
      render: (f) => (
        // A negative `owed` is an overpayment (contract gate 12): a correction or rejection undid
        // money already paid out. Said as such rather than as a minus sign; never clawed back automatically.
        (f.owed_inr ?? 0) < 0 ? (
          <span className="flex flex-col items-end whitespace-nowrap tabular-nums">
            <span className="font-medium text-error">{inr(Math.abs(f.owed_inr))}</span>
            <Badge color="error">Overpaid</Badge>
          </span>
        ) : (
          <span className={`whitespace-nowrap tabular-nums ${(f.owed_inr ?? 0) > 0 ? 'font-medium text-warning' : 'text-text-primary'}`}>
            {inr(f.owed_inr)}
          </span>
        )
      ),
    },
    {
      key: 'last_referral_at',
      header: 'Last referral',
      hideBelow: 'md',
      render: (f) => (f.last_referral_at ? formatDate(f.last_referral_at) : <span className="text-text-secondary">Never</span>),
    },
  ]

  return (
    <AdminShell>
      <div className="flex flex-col gap-lg">
        <div className="flex items-start justify-between gap-md">
          <div>
            <h1 className="text-h1 text-text-primary">Freelancers</h1>
            <p className="text-body-sm text-text-secondary">
              Each freelancer earns their own share of the commission immiNow actually collects on the students they
              bring — a payout is never more than what immiNow received, and only once immiNow has confirmed that
              money is in. Open a freelancer to set or change their share.
            </p>
          </div>
          <div className="shrink-0 whitespace-nowrap">
            <Button onClick={() => setInviting(true)}>Invite freelancer</Button>
          </div>
        </div>

        {/* Without the whole roster there are no totals to show; the list below still works. */}
        {!everyone.isError && <SummaryTiles freelancers={everyone.data} />}

        <Table
          columns={columns}
          rows={rows}
          rowKey={(f) => f.id}
          loading={freelancers.isLoading}
          error={freelancers.isError ? 'Could not load freelancers.' : undefined} errorSource={freelancers.error}
          emptyMessage={search || status ? 'No freelancers match these filters.' : 'No freelancer accounts yet.'}
          onRowClick={(f) => setViewingId(f.id)}
          search={{
            value: search,
            onChange: (value) => {
              if (value === search) return
              setSearch(value)
              paging.reset()
            },
            placeholder: 'Search name, email or code…',
          }}
          pagination={pager}
          filters={
            <CompactSelect
              value={status}
              onChange={(e) => {
                setStatus(e.target.value as '' | FreelancerStatus)
                paging.reset()
              }}
              label="Status"
            >
              <option value="">All statuses</option>
              <option value="invited">Invited</option>
              <option value="active">Active</option>
              <option value="deactivated">Deactivated</option>
            </CompactSelect>
          }
        />

        <FreelancerDrawer freelancer={viewingFreelancer} onClose={() => setViewingId(null)} />

        {inviting && (
          <InviteFreelancerModal
            onClose={() => setInviting(false)}
            onInvited={(email) => showToast(`Invite sent to ${email}`)}
          />
        )}
      </div>
    </AdminShell>
  )
}
