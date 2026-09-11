import { useEffect, useRef, useState } from 'react'
import { Info } from 'lucide-react'
import { FreelancerShell } from '@/features/auth/FreelancerShell'
import { Card } from '@/components/Card'
import { Badge } from '@/components/Badge'
import { Button } from '@/components/Button'
import { Table, type TableColumn } from '@/components/Table'
import { CompactSelect } from '@/components/CompactSelect'
import { FilterChip } from '@/components/FilterChip'
import { Drawer } from '@/components/Drawer'
import { Skeleton } from '@/components/QueryState'
import { useCursorPagination } from '@/lib/pagination'
import { formatDate, localDateISO } from '@/lib/time'
import { formatMoney, formatMoneyAmount } from '@/lib/money'
import {
  fetchAllFreelancerReferrals,
  useFreelancerMe,
  useFreelancerReferral,
  useFreelancerReferrals,
  type FreelancerOwnReferralsFilters,
  type FreelancerReferral,
} from '@/queries/freelancerReferrals'

const STAGE_ORDER = ['waiting', 'with_consultancy', 'plan_complete', 'succeeded', 'moved', 'closed'] as const
type Stage = (typeof STAGE_ORDER)[number]

const STAGE_LABEL: Record<Stage, string> = {
  waiting: 'Waiting for a consultancy',
  with_consultancy: 'With a consultancy',
  plan_complete: 'Plan complete',
  succeeded: 'Succeeded',
  moved: 'Moved to another consultancy',
  closed: 'Closed',
}
const STAGE_BADGE_COLOR: Record<Stage, 'success' | 'secondary' | 'info'> = {
  waiting: 'info',
  with_consultancy: 'info',
  plan_complete: 'info',
  succeeded: 'success',
  moved: 'secondary',
  closed: 'secondary',
}

const PAYOUT_ORDER = ['not_due', 'owed', 'paid'] as const
type PayoutStatus = (typeof PAYOUT_ORDER)[number]
const PAYOUT_LABEL: Record<PayoutStatus, string> = { not_due: 'Not due yet', owed: 'Owed', paid: 'Paid' }
const PAYOUT_BADGE_COLOR: Record<PayoutStatus, 'secondary' | 'warning' | 'success'> = {
  not_due: 'secondary',
  owed: 'warning',
  paid: 'success',
}

// Same "preset resolves to a from date, Custom reveals two date inputs" shape as SentpoUsersPage's
// JOINED_OPTIONS, applied to referred date instead of signup date.
const REFERRED_OPTIONS = [
  { value: '', label: 'Referred any time' },
  { value: '14', label: 'Referred in last 2 weeks' },
  { value: '30', label: 'Referred in last month' },
  { value: '90', label: 'Referred in last 3 months' },
  { value: 'custom', label: 'Referred between dates…' },
]

function daysAgoIsoDate(days: number): string {
  return localDateISO(new Date(Date.now() - days * 24 * 60 * 60 * 1000))
}

function csvCell(value: string): string {
  return /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value
}

function toCsv(rows: FreelancerReferral[]): string {
  const header = ['Student', 'Referred on', 'Stage', 'College', 'Your share', 'Earned', 'Paid', 'Owed', 'Payout']
  const lines = rows.map((r) => {
    const stage = r.stage ?? 'waiting'
    const payout = r.payout_status ?? 'not_due'
    return [
      r.applicant_name,
      formatDate(r.created_at),
      STAGE_LABEL[stage],
      r.commission?.college_name ?? '',
      !r.commission ? '' : r.commission.rate_missing ? 'Rate not set yet' : formatMoneyAmount(r.commission.your_cut),
      formatMoney('INR', r.earned_inr ?? 0),
      formatMoney('INR', r.paid_inr ?? 0),
      formatMoney('INR', r.owed_inr ?? 0),
      PAYOUT_LABEL[payout],
    ]
      .map((v) => csvCell(String(v)))
      .join(',')
  })
  return [header.join(','), ...lines].join('\n')
}

/**
 * "?" disclosure explaining the payout rule (spec item 2) — a tiny accessible popover rather than
 * pulling in a new dependency for one static paragraph. Same click-outside/Escape shape
 * NotificationsDropdown already uses for its own panel.
 */
function HowYouEarnInfo() {
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function onPointerDown(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false)
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  return (
    <div ref={containerRef} className="relative inline-flex">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-label="How you earn"
        className="flex h-6 w-6 items-center justify-center rounded-full text-text-secondary hover:bg-background hover:text-text-primary"
      >
        <Info className="h-4 w-4" />
      </button>
      {open && (
        <div
          role="dialog"
          aria-label="How you earn"
          style={{ width: '20rem' }}
          className="absolute left-0 top-8 z-50 rounded-md border border-border bg-surface p-md text-body-sm text-text-secondary shadow-card"
        >
          You earn your share of the commission Sentpo collects on each student you bring. It becomes payable once
          Sentpo has been paid for that student.
        </div>
      )}
    </div>
  )
}

/**
 * Compact code+link strip (spec item 3) — the same copy-to-clipboard behavior the old
 * "Your referral link" card had, condensed into one row since a freelancer with hundreds of
 * referrals needs this to stay out of the way of the list that matters more. "Copied" feedback
 * stays on the button itself rather than a toast (user-requested).
 */
function ReferralLinkStrip() {
  const me = useFreelancerMe()
  const [copied, setCopied] = useState<'code' | 'url' | null>(null)

  if (!me.data) return null
  const { referral_code, share_url } = me.data

  async function copy(value: string, which: 'code' | 'url') {
    await navigator.clipboard.writeText(value)
    setCopied(which)
    setTimeout(() => setCopied(null), 2000)
  }

  return (
    <div className="flex flex-wrap items-center gap-sm rounded-md border border-border bg-surface px-md py-sm">
      <span className="text-caption text-text-secondary">Your link</span>
      <code className="rounded-md bg-background px-sm py-xs text-body-sm font-medium tracking-widest text-text-primary">
        {referral_code}
      </code>
      <Button variant="secondary" size="sm" onClick={() => copy(referral_code, 'code')}>
        {copied === 'code' ? 'Copied!' : 'Copy code'}
      </Button>
      <code
        style={{ maxWidth: '20rem' }}
        className="min-w-0 flex-1 truncate rounded-md bg-background px-sm py-xs text-caption text-text-secondary"
      >
        {share_url}
      </code>
      <Button variant="secondary" size="sm" onClick={() => copy(share_url, 'url')}>
        {copied === 'url' ? 'Copied!' : 'Copy link'}
      </Button>
    </div>
  )
}

function SummaryStat({ label, value, tone }: { label: string; value: string; tone?: 'warning' | 'muted' }) {
  return (
    <div>
      <p className="text-caption text-text-secondary">{label}</p>
      <p className={`text-h2 ${tone === 'warning' ? 'text-warning' : tone === 'muted' ? 'text-text-secondary' : 'text-text-primary'}`}>
        {value}
      </p>
    </div>
  )
}

/** Front-and-center empty state (spec item 12) for a freelancer with zero referrals ever — distinct
 *  from the filtered-empty case, which stays a plain Table message since there is a real list to
 *  narrow, just not with these filters. */
function EmptyReferralsState() {
  return (
    <Card className="flex flex-col items-center gap-md py-xl text-center">
      <div>
        <p className="text-h3 text-text-primary">Share your link</p>
        <p className="mt-xs text-body-sm text-text-secondary">Every student who signs up with it appears here.</p>
      </div>
      <div style={{ maxWidth: '32rem' }} className="w-full">
        <ReferralLinkStrip />
      </div>
    </Card>
  )
}

function DrawerStat({ label, value, tone }: { label: string; value: string; tone?: 'warning' }) {
  return (
    <div>
      <p className="text-caption text-text-secondary">{label}</p>
      <p className={`text-body font-medium ${tone === 'warning' ? 'text-warning' : 'text-text-primary'}`}>{value}</p>
    </div>
  )
}

/** Row detail (spec item 11) — never shows rates, collections or any other platform figure, only
 *  what this freelancer themselves earned/were paid/are owed for this one student. */
function ReferralDrawer({ referral, onClose }: { referral: FreelancerReferral | null; onClose: () => void }) {
  const detail = useFreelancerReferral(referral?.id ?? '')
  const stage = referral?.stage ?? 'waiting'
  const payouts = detail.data?.payouts ?? []

  return (
    <Drawer open={Boolean(referral)} onClose={onClose} title={referral?.applicant_name ?? 'Referral'} dismissible>
      {referral && (
        <div className="flex flex-col gap-lg">
          <div className="flex flex-col gap-xs">
            <Badge color={STAGE_BADGE_COLOR[stage]} className="w-fit">
              {STAGE_LABEL[stage]}
            </Badge>
            <p className="text-body-sm text-text-secondary">Referred {formatDate(referral.created_at)}</p>
            {referral.commission?.college_name && (
              <p className="text-body-sm text-text-secondary">
                {referral.commission.college_name}
                {referral.commission.course_name ? ` · ${referral.commission.course_name}` : ''}
              </p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-md">
            <DrawerStat
              label="Your share"
              value={
                !referral.commission
                  ? '—'
                  : referral.commission.rate_missing
                    ? 'Rate not set yet'
                    : formatMoneyAmount(referral.commission.your_cut)
              }
            />
            <DrawerStat label="Earned so far" value={formatMoney('INR', referral.earned_inr ?? 0)} />
            <DrawerStat label="Paid to you" value={formatMoney('INR', referral.paid_inr ?? 0)} />
            <DrawerStat
              label="Owed to you"
              value={formatMoney('INR', referral.owed_inr ?? 0)}
              tone={(referral.owed_inr ?? 0) > 0 ? 'warning' : undefined}
            />
          </div>

          <div className="flex flex-col gap-sm border-t border-border pt-md">
            <h3 className="text-body font-medium text-text-primary">Payments to you</h3>
            {detail.isLoading && <Skeleton className="h-16 rounded-md" />}
            {detail.isError && <p className="text-body-sm text-error">Could not load payments.</p>}
            {!detail.isLoading && !detail.isError && payouts.length === 0 && (
              <p className="text-body-sm text-text-secondary">
                No payments yet — you&rsquo;re paid once Sentpo has been paid for this student.
              </p>
            )}
            {!detail.isLoading && !detail.isError && payouts.length > 0 && (
              <ul className="flex flex-col gap-sm">
                {payouts.map((p) => (
                  <li
                    key={p.id}
                    className={`flex items-center justify-between gap-md rounded-md border border-border px-md py-sm ${p.undone ? 'opacity-60' : ''}`}
                  >
                    <div>
                      <p className={`text-body-sm text-text-primary ${p.undone ? 'line-through' : ''}`}>
                        {formatDate(p.paid_on)}
                      </p>
                      {p.reference && <p className="text-caption text-text-secondary">{p.reference}</p>}
                    </div>
                    <div className="flex items-center gap-sm">
                      <span
                        className={`tabular-nums text-body-sm font-medium ${p.undone ? 'text-text-secondary line-through' : 'text-text-primary'}`}
                      >
                        {formatMoney('INR', p.amount_inr)}
                      </span>
                      {p.undone && <Badge color="secondary">Undone</Badge>}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </Drawer>
  )
}

export function FreelancerDashboardPage() {
  const [search, setSearch] = useState('')
  const [payoutStatus, setPayoutStatus] = useState<'' | PayoutStatus>('')
  const [stage, setStage] = useState<'' | Stage>('')
  const [referredPreset, setReferredPreset] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [sort, setSort] = useState<{ field: string; direction: 'asc' | 'desc' } | null>(null)
  const paging = useCursorPagination()
  const [viewing, setViewing] = useState<FreelancerReferral | null>(null)
  const [exporting, setExporting] = useState(false)
  const [exportError, setExportError] = useState<string | null>(null)

  function resetPaging() {
    paging.reset()
  }

  const baseFilters: FreelancerOwnReferralsFilters = {
    search: search || undefined,
    payout_status: payoutStatus || undefined,
    stage: stage || undefined,
    from:
      referredPreset && referredPreset !== 'custom'
        ? daysAgoIsoDate(Number(referredPreset))
        : referredPreset === 'custom' && from
          ? from
          : undefined,
    to: referredPreset === 'custom' && to ? to : undefined,
    sort: sort ? (sort.direction === 'desc' ? `-${sort.field}` : sort.field) : undefined,
  }

  const referrals = useFreelancerReferrals({ ...baseFilters, cursor: paging.cursor, limit: 25 })
  const rows = referrals.data?.items ?? []
  const summary = referrals.data?.summary
  const anyFilter = Boolean(search || payoutStatus || stage || referredPreset)

  async function handleDownload() {
    setExporting(true)
    setExportError(null)
    try {
      const all = await fetchAllFreelancerReferrals(baseFilters)
      const csv = toCsv(all)
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `sentpo-referrals-${localDateISO()}.csv`
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
    } catch {
      setExportError('Could not export your referrals.')
    } finally {
      setExporting(false)
    }
  }

  const columns: TableColumn<FreelancerReferral>[] = [
    {
      key: 'applicant_name',
      header: 'Student',
      sortable: true,
      render: (r) => (
        <div>
          <p className="font-medium text-text-primary">{r.applicant_name}</p>
          {r.commission?.college_name && <p className="text-caption text-text-secondary">{r.commission.college_name}</p>}
        </div>
      ),
    },
    {
      key: 'created_at',
      header: 'Referred on',
      sortable: true,
      hideBelow: 'sm',
      render: (r) => formatDate(r.created_at),
    },
    {
      key: 'stage',
      header: 'Stage',
      render: (r) => {
        const s = r.stage ?? 'waiting'
        return <Badge color={STAGE_BADGE_COLOR[s]}>{STAGE_LABEL[s]}</Badge>
      },
    },
    {
      key: 'your_share_inr',
      header: 'Your share',
      sortable: true,
      align: 'right',
      hideBelow: 'md',
      render: (r) =>
        !r.commission ? (
          <span className="text-text-secondary">—</span>
        ) : r.commission.rate_missing ? (
          <Badge color="warning">Rate not set yet</Badge>
        ) : (
          <span className="tabular-nums text-text-primary">{formatMoneyAmount(r.commission.your_cut)}</span>
        ),
    },
    {
      key: 'earned_inr',
      header: 'Earned',
      sortable: true,
      align: 'right',
      render: (r) => <span className="tabular-nums text-text-primary">{formatMoney('INR', r.earned_inr ?? 0)}</span>,
    },
    {
      key: 'paid_inr',
      header: 'Paid',
      align: 'right',
      hideBelow: 'md',
      render: (r) => <span className="tabular-nums text-text-primary">{formatMoney('INR', r.paid_inr ?? 0)}</span>,
    },
    {
      key: 'owed_inr',
      header: 'Owed',
      sortable: true,
      align: 'right',
      render: (r) => (
        <span className={`tabular-nums ${(r.owed_inr ?? 0) > 0 ? 'font-medium text-warning' : 'text-text-primary'}`}>
          {formatMoney('INR', r.owed_inr ?? 0)}
        </span>
      ),
    },
    {
      key: 'payout_status',
      header: 'Payout',
      render: (r) => {
        const p = r.payout_status ?? 'not_due'
        return <Badge color={PAYOUT_BADGE_COLOR[p]}>{PAYOUT_LABEL[p]}</Badge>
      },
    },
  ]

  return (
    <FreelancerShell>
      <div className="flex flex-col gap-lg">
        <div className="flex flex-col gap-sm">
          <div className="flex items-center gap-xs">
            <h1 className="text-h1 text-text-primary">Your referrals</h1>
            <HowYouEarnInfo />
          </div>
          <p className="text-body-sm text-text-secondary">
            Students who signed up with your link, where their case is, and what you&rsquo;ve earned.
          </p>
          <ReferralLinkStrip />
        </div>

        {summary && (
          <Card>
            <div className="grid grid-cols-2 gap-lg sm:grid-cols-4">
              <SummaryStat label="Earned so far" value={formatMoney('INR', summary.earned_inr)} />
              <SummaryStat label="Paid to you" value={formatMoney('INR', summary.paid_inr)} />
              <SummaryStat
                label="Owed to you"
                value={formatMoney('INR', summary.owed_inr)}
                tone={summary.owed_inr > 0 ? 'warning' : undefined}
              />
              <SummaryStat label="Expected once collected" value={formatMoney('INR', summary.expected_inr)} tone="muted" />
            </div>
          </Card>
        )}

        {summary && summary.referred === 0 ? (
          <EmptyReferralsState />
        ) : (
          <Table
            columns={columns}
            rows={rows}
            rowKey={(r) => r.id}
            onRowClick={(r) => setViewing(r)}
            loading={referrals.isLoading}
            error={referrals.isError ? 'Could not load your referrals.' : undefined}
            emptyMessage={anyFilter ? 'No referrals match these filters.' : 'No referrals yet.'}
            sort={sort}
            onSortChange={(field, direction) => {
              setSort({ field, direction })
              resetPaging()
            }}
            search={{
              value: search,
              onChange: (value) => {
                setSearch(value)
                resetPaging()
              },
              placeholder: 'Search by student name…',
            }}
            filters={
              <>
                <CompactSelect
                  value={referredPreset}
                  onChange={(e) => {
                    setReferredPreset(e.target.value)
                    resetPaging()
                  }}
                  label="Referred"
                >
                  {REFERRED_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </CompactSelect>
                {referredPreset === 'custom' && (
                  <>
                    <input
                      type="date"
                      aria-label="Referred from"
                      value={from}
                      onChange={(e) => {
                        setFrom(e.target.value)
                        resetPaging()
                      }}
                      className="h-10 rounded-md border border-border bg-background px-3 text-body-sm text-text-primary outline-none focus:border-primary"
                    />
                    <input
                      type="date"
                      aria-label="Referred to"
                      value={to}
                      onChange={(e) => {
                        setTo(e.target.value)
                        resetPaging()
                      }}
                      className="h-10 rounded-md border border-border bg-background px-3 text-body-sm text-text-primary outline-none focus:border-primary"
                    />
                  </>
                )}
              </>
            }
            quickFilters={
              summary && (
                <div className="flex flex-col items-end gap-xs">
                  <div className="flex flex-wrap items-center justify-end gap-xs">
                    <FilterChip
                      label={`All (${summary.referred})`}
                      active={payoutStatus === ''}
                      onChange={() => {
                        setPayoutStatus('')
                        resetPaging()
                      }}
                    />
                    {PAYOUT_ORDER.map((p) => (
                      <FilterChip
                        key={p}
                        label={`${PAYOUT_LABEL[p]} (${summary.by_payout_status[p]})`}
                        active={payoutStatus === p}
                        onChange={(active) => {
                          setPayoutStatus(active ? p : '')
                          resetPaging()
                        }}
                      />
                    ))}
                  </div>
                  <div className="flex flex-wrap items-center justify-end gap-xs">
                    <FilterChip
                      label="All stages"
                      active={stage === ''}
                      onChange={() => {
                        setStage('')
                        resetPaging()
                      }}
                    />
                    {STAGE_ORDER.filter((s) => summary.by_stage[s] > 0).map((s) => (
                      <FilterChip
                        key={s}
                        label={`${STAGE_LABEL[s]} (${summary.by_stage[s]})`}
                        active={stage === s}
                        onChange={(active) => {
                          setStage(active ? s : '')
                          resetPaging()
                        }}
                      />
                    ))}
                  </div>
                </div>
              )
            }
            filterActions={
              <div className="flex items-center gap-sm">
                {exportError && <p className="text-caption text-error">{exportError}</p>}
                <Button variant="secondary" size="sm" disabled={exporting} onClick={handleDownload}>
                  {exporting ? 'Preparing…' : 'Download CSV'}
                </Button>
              </div>
            }
            pagination={{
              hasNext: Boolean(referrals.data?.meta.next_cursor),
              hasPrevious: paging.hasPrevious,
              onNext: () => referrals.data?.meta.next_cursor && paging.next(referrals.data.meta.next_cursor),
              onPrevious: paging.previous,
              total: referrals.data?.meta.total,
            }}
          />
        )}

        <ReferralDrawer referral={viewing} onClose={() => setViewing(null)} />
      </div>
    </FreelancerShell>
  )
}
