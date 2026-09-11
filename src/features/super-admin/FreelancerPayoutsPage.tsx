import { useSearchParams } from 'react-router-dom'
import { AdminShell } from '@/features/auth/AdminShell'
import { ReferralsTab } from './freelancers/ReferralsTab'
import { PayoutHistoryTab } from './freelancers/PayoutHistoryTab'

const TABS = [
  { key: 'owed', label: 'Owed' },
  { key: 'not_due', label: 'Not yet due' },
  { key: 'history', label: 'Paid & history' },
] as const

type TabKey = (typeof TABS)[number]['key']

function isTabKey(value: string | null): value is TabKey {
  return TABS.some((t) => t.key === value)
}

/**
 * Freelancer Payouts, rebuilt 2026-09-11 on the /freelancer-referrals and /freelancer-payouts
 * endpoints — a payout is only ever owed once immiNow has confirmed collecting the consultancy's
 * payment on the case (part-payments earn part-payouts), and can never exceed what immiNow
 * actually received. Money moves outside the platform; recording a payout here just says it
 * happened. Tab state lives in the URL, same convention as Finance Dashboard.
 */
export function FreelancerPayoutsPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const tabParam = searchParams.get('tab')
  const activeTab: TabKey = isTabKey(tabParam) ? tabParam : 'owed'

  function setTab(tab: TabKey) {
    const next = new URLSearchParams(searchParams)
    next.set('tab', tab)
    setSearchParams(next)
  }

  return (
    <AdminShell>
      <div className="flex flex-col gap-lg">
        <div>
          <h1 className="text-h1 text-text-primary">Freelancer Payouts</h1>
          <p className="text-body-sm text-text-secondary">
            What each freelancer is owed, once immiNow has confirmed collecting the consultancy&rsquo;s payment on
            the case they referred — never more than immiNow actually received.
          </p>
        </div>

        <div className="flex gap-xs overflow-x-auto border-b border-border">
          {TABS.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setTab(tab.key)}
              className={`shrink-0 border-b-2 px-md py-sm text-body-sm ${
                activeTab === tab.key ? 'border-primary font-medium text-primary' : 'border-transparent text-text-secondary'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {activeTab === 'owed' && <ReferralsTab payoutStatus="owed" />}
        {activeTab === 'not_due' && <ReferralsTab payoutStatus="not_due" />}
        {activeTab === 'history' && <PayoutHistoryTab />}
      </div>
    </AdminShell>
  )
}
