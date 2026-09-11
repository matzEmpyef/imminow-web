import { useSearchParams } from 'react-router-dom'
import { AdminShell } from '@/features/auth/AdminShell'
import { Badge } from '@/components/Badge'
import { useFinanceSummary } from '@/queries/financeDashboard'
import { OverviewTab } from './finance/OverviewTab'
import { CasesTab } from './finance/CasesTab'
import { AwaitingTab } from './finance/AwaitingTab'
import { HistoryTab } from './finance/HistoryTab'

const TABS = [
  { key: 'overview', label: 'Overview' },
  { key: 'cases', label: 'Cases' },
  { key: 'awaiting', label: 'Awaiting confirmation' },
  { key: 'history', label: 'Payment history' },
] as const

type TabKey = (typeof TABS)[number]['key']

function isTabKey(value: string | null): value is TabKey {
  return TABS.some((t) => t.key === value)
}

/**
 * All the payment-related things in one place (user, 2026-08-28), rebuilt 2026-09-11 on the paged
 * /commission/finance/* endpoints: the old version loaded every active case and every payment in
 * one response and drew them as cards, which does not hold up once the platform has hundreds of
 * payments. Four tabs, each its own server-paged table — Overview keeps the glance tiles, chart and
 * a balances-by-consultancy table; Cases, Awaiting confirmation and Payment history split out what
 * used to be one long scroll. Tab state lives in the URL (?tab=) so a link can land on one directly
 * — e.g. the Overview "Awaiting confirmation" tile jumps straight to that tab.
 */
export function FinanceDashboardPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const tabParam = searchParams.get('tab')
  const activeTab: TabKey = isTabKey(tabParam) ? tabParam : 'overview'
  const summary = useFinanceSummary()

  function setTab(tab: TabKey) {
    const next = new URLSearchParams(searchParams)
    next.set('tab', tab)
    setSearchParams(next)
  }

  return (
    <AdminShell>
      <div className="flex flex-col gap-lg">
        <div>
          <h1 className="text-h1 text-text-primary">Finance Dashboard</h1>
          <p className="text-body-sm text-text-secondary">
            Every accepted case&rsquo;s commission, what the consultancy has collected so far, and the payments they
            have made to immiNow — declared ones await your confirmation in Awaiting confirmation.
          </p>
        </div>

        <div className="flex gap-xs overflow-x-auto border-b border-border">
          {TABS.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setTab(tab.key)}
              className={`flex shrink-0 items-center gap-xs border-b-2 px-md py-sm text-body-sm ${
                activeTab === tab.key ? 'border-primary font-medium text-primary' : 'border-transparent text-text-secondary'
              }`}
            >
              {tab.label}
              {tab.key === 'awaiting' && (summary.data?.awaiting.count ?? 0) > 0 && (
                <Badge color="warning">{summary.data?.awaiting.count}</Badge>
              )}
            </button>
          ))}
        </div>

        {activeTab === 'overview' && <OverviewTab onGoToAwaiting={() => setTab('awaiting')} />}
        {activeTab === 'cases' && <CasesTab />}
        {activeTab === 'awaiting' && <AwaitingTab />}
        {activeTab === 'history' && <HistoryTab />}
      </div>
    </AdminShell>
  )
}
