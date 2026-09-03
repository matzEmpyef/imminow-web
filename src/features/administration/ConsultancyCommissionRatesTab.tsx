// Split out of ConsultancyProfilePage.tsx (Phase 3 plan, Tier B2, 2026-09-03) — pure movement, no logic change.
import { Card } from '@/components/Card'
import { Badge } from '@/components/Badge'
import { useMyConsultancy } from '@/queries/consultancy'
import { useMyCommissionRates } from '@/queries/commissionRates'
import type { components } from '@/api/schema'

type CommissionRate = components['schemas']['CommissionRate']

// User-requested (2026-08-19) — "the commission rates set must be visible for consultancy under
// Consultancy Management tab." Read-only mirror of Super Admin's own Commission Rates drill-down
// (`ConsultancyRatesModal`) — these rates are immiNow-set (build reference 1.17), so there's no
// edit affordance here, just visibility into what's currently configured.
export function CommissionRatesTab({
  consultancy,
}: {
  consultancy: NonNullable<ReturnType<typeof useMyConsultancy>['data']>
}) {
  const rates = useMyCommissionRates()

  const ratesByCountry = new Map<string, CommissionRate[]>()
  for (const rate of rates.data ?? []) {
    if (!rate.destination_country) continue
    const list = ratesByCountry.get(rate.destination_country) ?? []
    list.push(rate)
    ratesByCountry.set(rate.destination_country, list)
  }

  return (
    <>
      <p className="text-body-sm text-text-secondary">
        The commission rates immiNow has configured for your consultancy — set on your behalf, not editable here.
      </p>

      <Card className="max-w-[42rem]">
        <div className="flex items-center justify-between">
          <h2 className="text-h3 text-text-primary">Freelancer channel</h2>
          <Badge color={consultancy.freelancer_enabled ? 'success' : 'secondary'}>
            {consultancy.freelancer_enabled ? 'Enabled' : 'Disabled'}
          </Badge>
        </div>
        <p className="mt-sm text-caption text-text-secondary">
          {consultancy.freelancer_enabled
            ? 'Freelancer-sourced applicants can be allocated to you, and the freelancer-sourced rate below applies.'
            : 'Freelancer-sourced applicants cannot be allocated to you, and any freelancer-sourced rate below is not applicable. Contact Platform Admin to enable it.'}
        </p>
      </Card>

      <Card className="max-w-[42rem]">
        <h2 className="text-h3 text-text-primary">Rates by country</h2>
        {rates.isLoading && <p className="mt-sm text-body-sm text-text-secondary">Loading…</p>}
        {rates.data?.length === 0 && <p className="mt-sm text-body-sm text-text-secondary">No rates configured yet.</p>}
        <div className="mt-sm flex flex-col gap-md">
          {[...ratesByCountry.entries()].map(([country, countryRates]) => (
            <div key={country} className="flex flex-col gap-xs border-b border-border pb-md last:border-0 last:pb-0">
              <Badge color="secondary" className="w-fit">
                {country}
              </Badge>
              {countryRates.map((rate) => (
                <div key={rate.id} className="flex items-center justify-between text-body-sm">
                  <span className="capitalize text-text-secondary">{rate.payer_method}</span>
                  <span className="text-text-primary">
                    Direct {rate.direct_rate}% · Freelancer {rate.freelancer_sourced_rate}%
                    {!consultancy.freelancer_enabled && (
                      <span className="text-caption text-text-secondary"> (not applicable)</span>
                    )}
                  </span>
                </div>
              ))}
            </div>
          ))}
        </div>
      </Card>
    </>
  )
}
