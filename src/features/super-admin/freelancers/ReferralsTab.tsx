import { useMemo, useState } from 'react'
import { Badge } from '@/components/Badge'
import { Button } from '@/components/Button'
import { StopPropagation } from '@/components/StopPropagation'
import { Table, type TableColumn } from '@/components/Table'
import { useCursorPagination } from '@/lib/pagination'
import { formatDate } from '@/lib/time'
import { useFreelancerReferralsAdmin, type FreelancerReferral } from '@/queries/freelancerReferrals'
import { FreelancerFilterSelect } from './FreelancerFilterSelect'
import { RecordPayoutModal } from './RecordPayoutModal'
import { BulkRecordPayoutModal } from './BulkRecordPayoutModal'

function inr(n: number | undefined | null): string {
  return `₹${(n ?? 0).toLocaleString('en-IN')}`
}

/**
 * Backs both the "Owed" and "Not yet due" tabs on Freelancer Payouts (2026-09-11) — same columns
 * and filters either way, differing only in which payout_status is requested, whether rows can be
 * selected/paid, and the explanatory copy each tab shows above the table. Keeping one component
 * for both avoids two tables silently drifting apart on a shared column set.
 */
export function ReferralsTab({ payoutStatus }: { payoutStatus: 'owed' | 'not_due' }) {
  const [search, setSearch] = useState('')
  const [freelancerId, setFreelancerId] = useState('')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [paying, setPaying] = useState<FreelancerReferral | null>(null)
  const [bulkPaying, setBulkPaying] = useState(false)
  const paging = useCursorPagination()
  const payable = payoutStatus === 'owed'

  function resetPaging() {
    paging.reset()
  }

  const referrals = useFreelancerReferralsAdmin({
    payout_status: payoutStatus,
    search: search || undefined,
    freelancer_id: freelancerId || undefined,
    sort: payable ? 'owed_since' : '-created_at',
    cursor: paging.cursor,
    limit: 20,
  })
  const rows = useMemo(() => referrals.data?.items ?? [], [referrals.data])
  const selectedRows = rows.filter((r) => selected.has(r.id))
  const selectedTotal = selectedRows.reduce((sum, r) => sum + (r.owed_inr ?? 0), 0)
  const totals = referrals.data?.totals

  const columns: TableColumn<FreelancerReferral>[] = [
    { key: 'freelancer', header: 'Freelancer', render: (r) => <span className="font-medium text-text-primary">{r.freelancer_name}</span> },
    { key: 'applicant', header: 'Student', render: (r) => r.applicant_name },
    {
      key: 'status',
      header: 'Case status',
      hideBelow: 'md',
      render: (r) => (
        <Badge color="info" className="capitalize">
          {r.status.replace(/_/g, ' ')}
        </Badge>
      ),
    },
    { key: 'rate_percent', header: 'Share %', align: 'right', hideBelow: 'sm', render: (r) => (r.rate_percent != null ? `${r.rate_percent}%` : '—') },
    {
      key: 'collected',
      header: 'Collected by immiNow',
      align: 'right',
      hideBelow: 'lg',
      render: (r) => <span className="whitespace-nowrap tabular-nums text-text-primary">{inr(r.collected_inr)}</span>,
    },
    {
      key: 'earned',
      header: 'Earned',
      align: 'right',
      hideBelow: 'lg',
      render: (r) => <span className="whitespace-nowrap tabular-nums text-text-primary">{inr(r.earned_inr)}</span>,
    },
    {
      key: 'paid',
      header: 'Paid',
      align: 'right',
      hideBelow: 'md',
      render: (r) => <span className="whitespace-nowrap tabular-nums text-text-primary">{inr(r.paid_inr)}</span>,
    },
    {
      key: 'owed',
      header: 'Owed',
      align: 'right',
      render: (r) => (
        <span className={`whitespace-nowrap tabular-nums ${(r.owed_inr ?? 0) > 0 ? 'font-medium text-warning' : 'text-text-primary'}`}>
          {inr(r.owed_inr)}
        </span>
      ),
    },
    ...(payable
      ? ([
          {
            key: 'owed_since',
            header: 'Owed since',
            hideBelow: 'md',
            render: (r) => (r.owed_since ? formatDate(r.owed_since) : '—'),
          },
          {
            key: 'actions',
            header: '',
            align: 'right',
            render: (r) => (
              <StopPropagation>
                <Button size="sm" onClick={() => setPaying(r)}>
                  <span className="whitespace-nowrap">Record payout</span>
                </Button>
              </StopPropagation>
            ),
          },
        ] as TableColumn<FreelancerReferral>[])
      : []),
  ]

  return (
    <div className="flex flex-col gap-md">
      {!payable && (
        <p className="rounded-md bg-background px-md py-sm text-body-sm text-text-secondary">
          Nothing is owed until immiNow confirms receiving the consultancy&rsquo;s payment on the case. Part-payments
          earn part-payouts as they come in.
        </p>
      )}

      {totals && (
        <p className="text-body-sm text-text-secondary">
          Earned {inr(totals.earned_inr)} · Paid {inr(totals.paid_inr)} · Owed {inr(totals.owed_inr)} for these
          filters
        </p>
      )}

      <Table
        columns={columns}
        rows={rows}
        rowKey={(r) => r.id}
        loading={referrals.isLoading}
        error={referrals.isError ? 'Could not load referrals.' : undefined}
        emptyMessage={payable ? 'Nothing owed right now.' : 'Nothing awaiting collection right now.'}
        search={{
          value: search,
          onChange: (value) => {
            setSearch(value)
            resetPaging()
          },
          placeholder: 'Search freelancer or student…',
        }}
        filters={
          <FreelancerFilterSelect
            value={freelancerId}
            onChange={(id) => {
              setFreelancerId(id)
              resetPaging()
            }}
          />
        }
        selection={
          payable
            ? {
                selectedIds: selected,
                onToggle: (id) =>
                  setSelected((prev) => {
                    const next = new Set(prev)
                    if (next.has(id)) next.delete(id)
                    else next.add(id)
                    return next
                  }),
                onToggleAll: (ids) => setSelected(new Set(ids)),
              }
            : undefined
        }
        filterActions={
          payable &&
          selected.size > 0 && (
            <div className="flex items-center gap-sm">
              <Button size="sm" onClick={() => setBulkPaying(true)}>
                Record payouts for {selected.size} selected (₹{selectedTotal.toLocaleString('en-IN')})
              </Button>
              <button
                type="button"
                onClick={() => setSelected(new Set())}
                className="rounded-md px-sm py-xs text-body-sm text-text-secondary hover:bg-background hover:text-text-primary"
              >
                Clear
              </button>
            </div>
          )
        }
        pagination={{
          hasNext: Boolean(referrals.data?.meta.next_cursor),
          hasPrevious: paging.hasPrevious,
          onNext: () => referrals.data?.meta.next_cursor && paging.next(referrals.data.meta.next_cursor),
          onPrevious: paging.previous,
          total: referrals.data?.meta.total,
        }}
      />

      {paying && <RecordPayoutModal referral={paying} onClose={() => setPaying(null)} />}
      {bulkPaying && (
        <BulkRecordPayoutModal
          referrals={selectedRows}
          onClose={() => setBulkPaying(false)}
          onDone={() => setSelected(new Set())}
        />
      )}
    </div>
  )
}
