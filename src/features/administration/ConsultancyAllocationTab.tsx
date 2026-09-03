// Split out of ConsultancyProfilePage.tsx (Phase 3 plan, Tier B2, 2026-09-03) — pure movement, no logic change.
import { useEffect, useState } from 'react'
import { Card } from '@/components/Card'
import { Skeleton } from '@/components/QueryState'
import { Button } from '@/components/Button'
import { useEmployees } from '@/queries/staff'
import { useAllocationRule, useUpdateAllocationRule } from '@/queries/allocationRules'

export function AllocationTab() {
  const rule = useAllocationRule()
  const employees = useEmployees()
  const updateRule = useUpdateAllocationRule()

  const [mode, setMode] = useState<'manual' | 'round_robin'>('manual')
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

  function handleSave() {
    updateRule.mutate({ mode, participating_employee_ids: [...selected] })
  }

  if (rule.isLoading) {
    return <Skeleton className="h-40 rounded-lg" />
  }

  return (
    <Card className="max-w-[36rem]">
      <p className="text-body-sm font-medium text-text-primary">Incoming leads are allocated</p>
      <div className="mt-sm flex gap-md">
        <label className="flex items-center gap-xs text-body-sm">
          <input type="radio" checked={mode === 'manual'} onChange={() => setMode('manual')} />
          Manually
        </label>
        <label className="flex items-center gap-xs text-body-sm">
          <input type="radio" checked={mode === 'round_robin'} onChange={() => setMode('round_robin')} />
          Automatically (round-robin)
        </label>
      </div>

      {mode === 'round_robin' && (
        <div className="mt-md border-t border-border pt-md">
          <p className="text-body-sm font-medium text-text-primary">Participating consultants</p>
          <p className="text-caption text-text-secondary">
            New leads rotate between these employees, balanced by current load.
          </p>
          <div className="mt-sm flex flex-col gap-xs">
            {employees.data?.items.map((emp) => (
              <label key={emp.id} className="flex items-center gap-xs text-body-sm">
                <input
                  type="checkbox"
                  checked={selected.has(emp.id)}
                  onChange={() => toggleEmployee(emp.id)}
                  className="h-4 w-4"
                />
                {emp.user.first_name} {emp.user.last_name}
              </label>
            ))}
          </div>
        </div>
      )}

      {updateRule.isSuccess && <p className="mt-md text-body-sm text-success">Saved.</p>}
      <Button className="mt-md" loading={updateRule.isPending} onClick={handleSave}>
        Save
      </Button>
    </Card>
  )
}
