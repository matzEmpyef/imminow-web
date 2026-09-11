import { Fragment, useMemo, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Drawer } from '@/components/Drawer'
import { Modal } from '@/components/Modal'
import { Badge } from '@/components/Badge'
import { Button } from '@/components/Button'
import { Toggle } from '@/components/Toggle'
import { formatDate, relativeTime } from '@/lib/time'
import { useUpdateEntitlements } from '@/queries/adminConsultancies'
import { useCommissionRates, type CommissionRateCoverageRow } from '@/queries/commissionRates'
import { RateEditorModal } from './RateEditorModal'
import type { components } from '@/api/schema'

type CommissionRate = components['schemas']['CommissionRate']
type PayerMethod = NonNullable<CommissionRate['payer_method']>

const RATE_GROUPS: { key: PayerMethod; label: string }[] = [
  { key: 'applicant', label: 'Applicant' },
  { key: 'college', label: 'College' },
  { key: 'split', label: 'Split' },
  { key: 'pr', label: 'PR case' },
]

/**
 * One account's rate coverage, drilled into from the Commission Rates table row (2026-09-11
 * rebuild). Replaces the old page's ConsultancyRatesModal + inline RateEditor pair: there is now
 * exactly one edit path per country (the "Edit" button, opening {@link RateEditorModal} locked to
 * this account and that country) — no per-row Save that could silently zero a rate out, and every
 * missing payer type reads "Not set — X% default" instead of just not being in the list.
 */
export function CommissionAccountDrawer({
  row,
  onClose,
}: {
  row: CommissionRateCoverageRow | null
  onClose: () => void
}) {
  const consultancyId = row?.consultancy_id
  const queryClient = useQueryClient()
  const rates = useCommissionRates(consultancyId, { enabled: Boolean(consultancyId) })
  const updateEntitlements = useUpdateEntitlements(consultancyId ?? '')
  const [pendingFreelancer, setPendingFreelancer] = useState<boolean | null>(null)
  const [editingCountry, setEditingCountry] = useState<string | null>(null)

  const ratesByCountry = useMemo(() => {
    const map = new Map<string, CommissionRate[]>()
    for (const rate of rates.data ?? []) {
      if (!rate.destination_country) continue
      const list = map.get(rate.destination_country) ?? []
      list.push(rate)
      map.set(rate.destination_country, list)
    }
    return map
  }, [rates.data])

  const servedCountries = useMemo(() => [...(row?.countries_served ?? [])].sort(), [row])
  const freelancerEnabled = Boolean(row?.freelancer_enabled)

  return (
    <Drawer open={row != null} onClose={onClose} title={row?.consultancy_name ?? 'Account'}>
      {row && (
        <div className="flex flex-col gap-lg">
          <div className="flex flex-wrap items-center gap-sm">
            <Badge color={row.kind === 'institute' ? 'secondary' : 'primary'}>
              {row.kind === 'institute' ? 'University' : 'Consultancy'}
            </Badge>
            <span className="text-caption text-text-secondary">
              Default for gaps: {row.default_percent}%
            </span>
          </div>

          <div className="flex items-center justify-between gap-md rounded-md bg-background px-md py-sm">
            <div>
              <p className="text-body-sm font-medium text-text-primary">Freelancer channel</p>
              <p className="text-caption text-text-secondary">
                When off, every Freelancer % rate below is not applicable and Applicant Allocation won't offer this
                consultancy for freelancer-sourced aspirants.
              </p>
            </div>
            <Toggle checked={freelancerEnabled} onChange={(checked) => setPendingFreelancer(checked)} label="Freelancer channel" />
          </div>

          <div className="flex flex-col gap-md">
            {servedCountries.length === 0 && (
              <p className="text-body-sm text-text-secondary">This account has not selected any served countries yet.</p>
            )}
            {servedCountries.map((country) => {
              const countryRates = ratesByCountry.get(country) ?? []
              return (
                <div key={country} className="flex flex-col gap-sm rounded-md border border-border p-md">
                  <div className="flex items-center justify-between">
                    <Badge color="secondary">{country}</Badge>
                    <Button variant="secondary" size="sm" onClick={() => setEditingCountry(country)}>
                      Edit
                    </Button>
                  </div>
                  <div
                    className="grid items-center gap-x-sm gap-y-xs text-body-sm"
                    style={{ gridTemplateColumns: freelancerEnabled ? '5rem 1fr 1fr' : '5rem 1fr' }}
                  >
                    <span />
                    <span className="text-caption font-medium text-text-secondary">Direct %</span>
                    {freelancerEnabled && <span className="text-caption font-medium text-text-secondary">Freelancer %</span>}
                    {RATE_GROUPS.map(({ key, label }) => {
                      const rate = countryRates.find((r) => r.payer_method === key)
                      return (
                        <Fragment key={key}>
                          <span className="text-text-secondary">{label}</span>
                          {rate ? (
                            <span className="tabular-nums text-text-primary">{rate.direct_rate}%</span>
                          ) : (
                            <span className="text-caption text-warning">Not set — {row.default_percent}% default</span>
                          )}
                          {freelancerEnabled && (
                            <span className="tabular-nums text-text-primary">
                              {rate ? `${rate.freelancer_sourced_rate}%` : '—'}
                            </span>
                          )}
                        </Fragment>
                      )
                    })}
                  </div>
                </div>
              )
            })}
          </div>

          <p className="text-caption text-text-secondary">
            {row.last_changed_at
              ? `Last changed ${relativeTime(row.last_changed_at)} (${formatDate(row.last_changed_at)})${
                  row.last_changed_by_name ? ` by ${row.last_changed_by_name}` : ''
                }`
              : 'Never changed.'}
          </p>
        </div>
      )}

      {pendingFreelancer !== null && row && (
        <Modal
          onClose={() => setPendingFreelancer(null)}
          title={pendingFreelancer ? 'Turn the freelancer channel on?' : 'Turn the freelancer channel off?'}
          widthRem={26}
          footer={
            <div className="flex justify-end gap-sm">
              <Button variant="secondary" onClick={() => setPendingFreelancer(null)}>
                Cancel
              </Button>
              <Button
                variant={pendingFreelancer ? 'primary' : 'destructive'}
                loading={updateEntitlements.isPending}
                onClick={() =>
                  updateEntitlements.mutate(
                    { freelancer_enabled: pendingFreelancer },
                    {
                      // useUpdateEntitlements only invalidates admin-consultancies — this drawer's
                      // `row` comes from the separate /commission-rates/coverage query, which needs
                      // its own invalidation or the toggle would visually not take (2026-09-11).
                      onSuccess: () => {
                        queryClient.invalidateQueries({ queryKey: ['commission-rates', 'coverage'] })
                        setPendingFreelancer(null)
                      },
                    },
                  )
                }
              >
                {pendingFreelancer ? 'Turn on' : 'Turn off'}
              </Button>
            </div>
          }
        >
          <p className="text-body-sm text-text-secondary">
            {pendingFreelancer
              ? 'Applicant Allocation will start offering this consultancy for freelancer-sourced students again, and its freelancer % rates will apply again.'
              : 'Applicant Allocation stops offering this consultancy for freelancer-sourced students, and freelancer % rates stop applying.'}
          </p>
        </Modal>
      )}

      {editingCountry && row && (
        <RateEditorModal
          defaultConsultancyId={row.consultancy_id}
          defaultConsultancyName={row.consultancy_name}
          defaultCountry={editingCountry}
          lockConsultancy
          lockCountry
          onClose={() => setEditingCountry(null)}
        />
      )}
    </Drawer>
  )
}
