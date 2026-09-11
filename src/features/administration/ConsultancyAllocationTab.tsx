// Split out of ConsultancyProfilePage.tsx (Phase 3 plan, Tier B2, 2026-09-03).
// Reworked 2026-09-10 (user: "in allocation rule, explain what it is and where it is applicable
// (make sure it is applicable)"). The rule now actually runs — the server assigns a new Sentpo lead
// by it the moment the student starts a chat (autoAllocationTarget in mock-server/server.js) — and
// this tab says in plain words what it does, what it applies to, and what it does not.
import { useEffect, useState } from 'react'
import { ArrowRight, Hand, Shuffle } from 'lucide-react'
import { Card } from '@/components/Card'
import { Skeleton } from '@/components/QueryState'
import { Button } from '@/components/Button'
import { useEmployees } from '@/queries/staff'
import { useAllocationRule, useUpdateAllocationRule } from '@/queries/allocationRules'
import { showToast } from '@/lib/toast'

type Mode = 'manual' | 'round_robin'

function ModeCard({
  selected,
  onSelect,
  icon,
  title,
  body,
}: {
  selected: boolean
  onSelect: () => void
  icon: React.ReactNode
  title: string
  body: string
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onSelect}
      className={`flex items-start gap-sm rounded-lg border p-md text-left transition-colors ${
        selected ? 'border-2 border-primary bg-primary/5' : 'border-border bg-surface hover:border-primary'
      }`}
    >
      <span
        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-md ${
          selected ? 'bg-primary text-text-on-primary' : 'bg-background text-text-secondary'
        }`}
      >
        {icon}
      </span>
      <span className="flex flex-col gap-0.5">
        <span className="text-body font-medium text-text-primary">{title}</span>
        <span className="text-body-sm text-text-secondary">{body}</span>
      </span>
    </button>
  )
}

export function AllocationTab({ enabled }: { enabled: boolean }) {
  const rule = useAllocationRule()
  const employees = useEmployees()
  const updateRule = useUpdateAllocationRule()

  const [mode, setMode] = useState<Mode>('manual')
  const [selected, setSelected] = useState<Set<string>>(new Set())

  useEffect(() => {
    if (!rule.data) return
    setMode(rule.data.mode)
    setSelected(new Set(rule.data.participating_employee_ids))
  }, [rule.data])

  function toggleEmployee(id: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const activeEmployees = (employees.data?.items ?? []).filter((e) => e.active !== false)
  const noOneChosen = mode === 'round_robin' && selected.size === 0

  const explainer = (
    <Card>
      <h2 className="text-h3 text-text-primary">What the allocation rule does</h2>
      <p className="mt-xs text-body-sm text-text-secondary">
        It decides who a new lead goes to when a student starts a chat with your consultancy in the Sentpo app.
      </p>
      <div className="mt-md grid grid-cols-1 gap-md md:grid-cols-2">
        <div className="rounded-md bg-success/10 p-md">
          <p className="text-body-sm font-medium text-text-primary">Applies to</p>
          <ul className="mt-xs flex flex-col gap-xs text-body-sm text-text-secondary">
            <li>New leads from the Sentpo app, the moment the student starts the chat.</li>
          </ul>
        </div>
        <div className="rounded-md bg-background p-md">
          <p className="text-body-sm font-medium text-text-primary">Does not apply to</p>
          <ul className="mt-xs flex flex-col gap-xs text-body-sm text-text-secondary">
            <li>Leads you add or import yourself — you assign those.</li>
            <li>Leads already waiting in Lead Pool, and reassigning a lead.</li>
          </ul>
        </div>
      </div>
    </Card>
  )

  if (!enabled) {
    return (
      <>
        {explainer}
        <Card>
          <p className="text-body-sm text-text-secondary">
            Automatic allocation is part of the Business plan. On your plan every new lead waits in Lead Pool until
            someone allocates it — see Subscription to upgrade.
          </p>
        </Card>
      </>
    )
  }

  if (rule.isLoading) return <Skeleton className="h-40 rounded-lg" />

  return (
    <>
      {explainer}

      <Card className="flex flex-col gap-md">
        <h2 className="text-h3 text-text-primary">How new leads are allocated</h2>
        <div role="radiogroup" aria-label="Allocation mode" className="grid grid-cols-1 gap-md md:grid-cols-2">
          <ModeCard
            selected={mode === 'manual'}
            onSelect={() => setMode('manual')}
            icon={<Hand className="h-5 w-5" aria-hidden />}
            title="Manually"
            body="New leads wait in Lead Pool until someone allocates them to a consultant."
          />
          <ModeCard
            selected={mode === 'round_robin'}
            onSelect={() => setMode('round_robin')}
            icon={<Shuffle className="h-5 w-5" aria-hidden />}
            title="Automatically"
            body="Each new lead goes straight to one of the consultants you choose below — whoever has the fewest active leads. Equal loads take turns."
          />
        </div>

        {mode === 'round_robin' && (
          <div className="flex flex-col gap-sm border-t border-border pt-md">
            <div>
              <p className="text-body-sm font-medium text-text-primary">Consultants who receive new leads</p>
              <p className="text-caption text-text-secondary">
                Only active employees are listed. A disabled employee stops receiving leads automatically.
              </p>
            </div>
            <div className="grid grid-cols-1 gap-xs sm:grid-cols-2 lg:grid-cols-3">
              {activeEmployees.map((emp) => (
                <label
                  key={emp.id}
                  className={`flex cursor-pointer items-center gap-sm rounded-md border px-sm py-xs text-body-sm ${
                    selected.has(emp.id) ? 'border-primary bg-primary/5' : 'border-border'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={selected.has(emp.id)}
                    onChange={() => toggleEmployee(emp.id)}
                    className="h-4 w-4"
                  />
                  <span className="text-text-primary">
                    {emp.user.first_name} {emp.user.last_name}
                  </span>
                </label>
              ))}
            </div>
            {noOneChosen && (
              <p className="rounded-md bg-warning/10 px-md py-sm text-body-sm text-text-primary">
                Choose at least one consultant — until you do, new leads keep waiting in Lead Pool.
              </p>
            )}
          </div>
        )}

        <div className="flex items-center justify-end gap-md border-t border-border pt-md">
          {updateRule.isError && <p className="text-body-sm text-error">{updateRule.error.message}</p>}
          <Button
            loading={updateRule.isPending}
            onClick={() =>
              updateRule.mutate(
                { mode, participating_employee_ids: [...selected] },
                { onSuccess: () => showToast('Allocation rule saved') },
              )
            }
            className="inline-flex items-center gap-xs"
          >
            Save
            <ArrowRight className="h-4 w-4" aria-hidden />
          </Button>
        </div>
      </Card>
    </>
  )
}
