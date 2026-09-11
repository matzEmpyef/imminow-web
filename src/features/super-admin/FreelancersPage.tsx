import { useMemo, useState } from 'react'
import { AdminShell } from '@/features/auth/AdminShell'
import { Badge } from '@/components/Badge'
import { Button } from '@/components/Button'
import { CompactSelect } from '@/components/CompactSelect'
import { Card } from '@/components/Card'
import { Table, type TableColumn } from '@/components/Table'
import { formatDate } from '@/lib/time'
import { useFreelancers, type Freelancer } from '@/queries/freelancerRates'
import { InviteFreelancerModal } from './freelancers/InviteFreelancerModal'
import { FreelancerDrawer } from './freelancers/FreelancerDrawer'

const STATUS_BADGE = {
  invited: { color: 'warning', label: 'Invited' },
  active: { color: 'success', label: 'Active' },
  deactivated: { color: 'secondary', label: 'Deactivated' },
} as const

function inr(n: number | undefined): string {
  return `₹${(n ?? 0).toLocaleString('en-IN')}`
}

function SummaryTiles({ freelancers }: { freelancers: Freelancer[] }) {
  const activeCount = freelancers.filter((f) => f.status === 'active' || (f.status == null && f.active !== false)).length
  const invitedCount = freelancers.filter((f) => f.status === 'invited').length
  const owedTotal = freelancers.reduce((sum, f) => sum + (f.owed_inr ?? 0), 0)
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
 * status, and per-freelancer earned/paid/owed totals). The roster is small enough per the
 * contract note that search and status filtering stay client-side, same as before the rebuild —
 * everything account-specific (share editing, changing the code, resend, activation, the
 * freelancer's own referrals) moved into {@link FreelancerDrawer} so the row stays scannable.
 *
 * The separate Rates tab is gone (user, 2026-09-11): the roster shows each share and the drawer
 * sets or edits it, which was everything that tab did.
 */
export function FreelancersPage() {
  const freelancers = useFreelancers()
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState<'' | 'invited' | 'active' | 'deactivated'>('')
  const [viewingId, setViewingId] = useState<string | null>(null)
  const [inviting, setInviting] = useState(false)
  const [invitedEmail, setInvitedEmail] = useState<string | null>(null)

  const rows = useMemo(() => {
    const items = freelancers.data ?? []
    const q = search.trim().toLowerCase()
    return items.filter((f) => {
      if (status && f.status !== status) return false
      if (!q) return true
      return (
        f.name?.toLowerCase().includes(q) ||
        f.email?.toLowerCase().includes(q) ||
        f.referral_code?.toLowerCase().includes(q)
      )
    })
  }, [freelancers.data, search, status])

  const viewingFreelancer = useMemo(
    () => (viewingId ? (freelancers.data ?? []).find((f) => f.id === viewingId) ?? null : null),
    [viewingId, freelancers.data],
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
        <span className={`whitespace-nowrap tabular-nums ${(f.owed_inr ?? 0) > 0 ? 'font-medium text-warning' : 'text-text-primary'}`}>
          {inr(f.owed_inr)}
        </span>
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

        {invitedEmail && (
          <p className="rounded-md bg-success/10 px-md py-sm text-body-sm text-success">
            Invite sent to {invitedEmail}.
          </p>
        )}

        <SummaryTiles freelancers={freelancers.data ?? []} />

        <Table
          columns={columns}
          rows={rows}
          rowKey={(f) => f.id}
          loading={freelancers.isLoading}
          error={freelancers.isError ? 'Could not load freelancers.' : undefined}
          emptyMessage="No freelancer accounts yet."
          onRowClick={(f) => setViewingId(f.id)}
          search={{ value: search, onChange: setSearch, placeholder: 'Search name, email or code…' }}
          filters={
            <CompactSelect
              value={status}
              onChange={(e) => setStatus(e.target.value as '' | 'invited' | 'active' | 'deactivated')}
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
            onInvited={(email) => {
              setInvitedEmail(email)
              setTimeout(() => setInvitedEmail(null), 5000)
            }}
          />
        )}
      </div>
    </AdminShell>
  )
}
