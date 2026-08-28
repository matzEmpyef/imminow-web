import { useMemo, useState } from 'react'
import { Power, PowerOff } from 'lucide-react'
import { AdminShell } from '@/features/auth/AdminShell'
import { Badge } from '@/components/Badge'
import { Button } from '@/components/Button'
import { Modal } from '@/components/Modal'
import { Table, type TableColumn } from '@/components/Table'
import { FreelancerRatesPanel } from './FreelancerRatesPage'
import { useFreelancers, useSetFreelancerActive } from '@/queries/freelancerRates'
import type { components } from '@/api/schema'

type Freelancer = components['schemas']['Freelancer']

/**
 * Freelancer accounts — the roster, and the only place their access can be turned off.
 *
 * Added 2026-08-23. The activate/deactivate endpoint existed and was verified, but there was
 * nowhere to call it from: Freelancer Payouts is one row per payout and Freelancer Rates is one
 * row per rate, so neither lists the accounts themselves. A capability with no surface is the same
 * shape of gap as a rule with no enforcement, which this codebase has produced repeatedly.
 */
// Two views of one subject (user-requested, 2026-08-27) — the people, and what each of them earns.
// Rates were their own sidebar entry, which made them look like a separate thing to administer;
// they are not, and a rate has no meaning without the freelancer it belongs to.
const TABS = ['Freelancers', 'Rates'] as const
type Tab = (typeof TABS)[number]

export function FreelancersPage() {
  const [activeTab, setActiveTab] = useState<Tab>('Freelancers')
  const freelancers = useFreelancers()
  const [search, setSearch] = useState('')
  const [confirming, setConfirming] = useState<Freelancer | null>(null)

  const rows = useMemo(() => {
    const items = freelancers.data ?? []
    const q = search.trim().toLowerCase()
    if (!q) return items
    return items.filter(
      (f) =>
        f.name?.toLowerCase().includes(q) ||
        f.email?.toLowerCase().includes(q) ||
        f.referral_code?.toLowerCase().includes(q),
    )
  }, [freelancers.data, search])

  const activeCount = (freelancers.data ?? []).filter((f) => f.active !== false).length
  const total = (freelancers.data ?? []).length

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
      header: 'Referral Code',
      hideBelow: 'md',
      // The code IS the account's working part — students reach a freelancer by typing it at
      // signup — so it belongs on the row rather than behind a detail view.
      render: (f) => <span className="font-mono text-body-sm text-text-primary">{f.referral_code}</span>,
    },
    {
      key: 'status',
      header: 'Status',
      render: (f) =>
        f.active !== false ? <Badge color="success">Active</Badge> : <Badge color="secondary">Deactivated</Badge>,
    },
    {
      key: 'actions',
      header: '',
      align: 'right',
      render: (f) => <RowAction freelancer={f} onConfirmDeactivate={() => setConfirming(f)} />,
    },
  ]

  return (
    <AdminShell>
      <div className="flex flex-col gap-lg">
        <div>
          <h1 className="text-h1 text-text-primary">Freelancers</h1>
          <p className="text-body-sm text-text-secondary">
            Referral partners who bring students onto Sentpo. {total > 0 && `${activeCount} of ${total} active.`}
          </p>
        </div>

        <div className="flex gap-xs overflow-x-auto border-b border-border">
          {TABS.map((tab) => (
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

        {activeTab === 'Rates' && <FreelancerRatesPanel />}

        {activeTab === 'Freelancers' && (
          <>
        <Table
          columns={columns}
          rows={rows}
          rowKey={(f) => f.id!}
          loading={freelancers.isLoading}
          error={freelancers.isError ? 'Could not load freelancers.' : undefined}
          emptyMessage="No freelancer accounts yet."
          search={{ value: search, onChange: setSearch, placeholder: 'Search name, email or code…' }}
        />

            {confirming && <DeactivateModal freelancer={confirming} onClose={() => setConfirming(null)} />}
          </>
        )}
      </div>
    </AdminShell>
  )
}

// Row-level component so the mutation hook is called at its own render top level, not inside
// Table's `render` callback — the same reasoning every other row action on this console uses.
function RowAction({ freelancer, onConfirmDeactivate }: { freelancer: Freelancer; onConfirmDeactivate: () => void }) {
  const setActive = useSetFreelancerActive()
  const isActive = freelancer.active !== false

  // Reactivating is harmless and reversible, so it happens on the spot. Deactivating cuts off
  // sign-in and stops their code earning, so it goes through a confirm — the same asymmetry the
  // rest of the console applies to destructive actions.
  if (isActive) {
    return (
      <button
        type="button"
        onClick={onConfirmDeactivate}
        aria-label={`Deactivate ${freelancer.name}`}
        title="Deactivate"
        className="flex h-9 w-9 items-center justify-center rounded-md text-text-secondary hover:bg-background hover:text-error"
      >
        <PowerOff className="h-4 w-4" />
      </button>
    )
  }

  return (
    <button
      type="button"
      disabled={setActive.isPending}
      onClick={() => setActive.mutate({ id: freelancer.id!, active: true })}
      aria-label={`Reactivate ${freelancer.name}`}
      title="Reactivate"
      className="flex h-9 w-9 items-center justify-center rounded-md text-text-secondary hover:bg-background hover:text-success disabled:opacity-50"
    >
      <Power className="h-4 w-4" />
    </button>
  )
}

function DeactivateModal({ freelancer, onClose }: { freelancer: Freelancer; onClose: () => void }) {
  const setActive = useSetFreelancerActive()

  return (
    <Modal
      onClose={onClose}
      title="Deactivate Freelancer"
      widthRem={28}
      footer={
        <>
          {setActive.isError && (
            <p className="mr-auto self-center text-body-sm text-error">{setActive.error.message}</p>
          )}
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            loading={setActive.isPending}
            onClick={() => setActive.mutate({ id: freelancer.id!, active: false }, { onSuccess: onClose })}
          >
            Deactivate
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-sm">
        <p className="text-body text-text-primary">
          Deactivate <span className="font-medium">{freelancer.name}</span>?
        </p>
        <ul className="flex list-disc flex-col gap-xs pl-lg text-body-sm text-text-secondary">
          <li>They can no longer sign in — any active session stops working immediately.</li>
          <li>
            Their referral code <span className="font-mono">{freelancer.referral_code}</span> stops attributing new
            students. Anyone who signs up with it is simply unattributed.
          </li>
          <li>
            Payouts already earned on students they referred stay owed and visible — nothing is deleted, and this can be
            undone.
          </li>
        </ul>
      </div>
    </Modal>
  )
}
