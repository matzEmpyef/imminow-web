// Split out of ConsultancyProfilePage.tsx (Phase 3 plan, Tier B2, 2026-09-03).
// "Platform Commission Rates" since 2026-09-10 (user: "rename commission rates to platform
// commission rates") — the rates immiNow has set for this consultancy, as distinct from the
// commission a college pays the consultancy, which is set per college on Partner Colleges.
import { Card } from '@/components/Card'
import { CountryLabel } from '@/components/CountryLabel'
import { Badge } from '@/components/Badge'
import { useMyConsultancy } from '@/queries/consultancy'
import { useMyCommissionRates } from '@/queries/commissionRates'
import type { components } from '@/api/schema'

type CommissionRate = components['schemas']['CommissionRate']

// User-requested (2026-08-19) — "the commission rates set must be visible for consultancy under
// Consultancy Management tab." Read-only mirror of Super Admin's own Commission Rates drill-down
// — these rates are immiNow-set (build reference 1.17), so there's no edit affordance here.
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
        The commission rates immiNow has set for your consultancy, by destination country and payer method. Set on your
        behalf, not editable here.
      </p>

      <Card className="flex flex-wrap items-center justify-between gap-md">
        <div className="min-w-0 flex-1">
          <h2 className="text-h3 text-text-primary">Freelancer channel</h2>
          <p className="mt-xs text-body-sm text-text-secondary">
            {consultancy.freelancer_enabled
              ? 'Freelancer-sourced applicants can be allocated to you, and the freelancer-sourced rate below applies.'
              : 'Freelancer-sourced applicants cannot be allocated to you, and the freelancer-sourced rate below does not apply. Contact Platform Admin to enable it.'}
          </p>
        </div>
        <Badge color={consultancy.freelancer_enabled ? 'success' : 'secondary'}>
          {consultancy.freelancer_enabled ? 'Enabled' : 'Disabled'}
        </Badge>
      </Card>

      <Card>
        <h2 className="text-h3 text-text-primary">Rates by country</h2>
        {rates.isLoading && <p className="mt-sm text-body-sm text-text-secondary">Loading…</p>}
        {rates.isError && <p className="mt-sm text-body-sm text-error">Could not load the rates.</p>}
        {rates.data?.length === 0 && <p className="mt-sm text-body-sm text-text-secondary">No rates configured yet.</p>}
        {ratesByCountry.size > 0 && (
          <div className="mt-sm overflow-x-auto rounded-md border border-border">
            <table className="w-full text-left text-body-sm">
              <thead className="bg-background text-caption text-text-secondary">
                <tr>
                  <th className="px-md py-sm font-medium">Destination country</th>
                  <th className="px-md py-sm font-medium">Payer method</th>
                  <th className="px-md py-sm text-right font-medium">Direct</th>
                  <th className="px-md py-sm text-right font-medium">Freelancer-sourced</th>
                </tr>
              </thead>
              <tbody>
                {[...ratesByCountry.entries()].map(([country, countryRates]) =>
                  countryRates.map((rate, i) => (
                    <tr key={rate.id} className={i === 0 ? 'border-t border-border' : ''}>
                      {i === 0 && (
                        <td className="px-md py-sm align-top text-text-primary" rowSpan={countryRates.length}>
                          <CountryLabel name={country} />
                        </td>
                      )}
                      <td className="px-md py-sm capitalize text-text-secondary">{rate.payer_method}</td>
                      <td className="px-md py-sm text-right tabular-nums text-text-primary">{rate.direct_rate}%</td>
                      <td
                        className={`px-md py-sm text-right tabular-nums ${
                          consultancy.freelancer_enabled ? 'text-text-primary' : 'text-text-secondary line-through'
                        }`}
                        title={consultancy.freelancer_enabled ? undefined : 'Not applicable — freelancer channel disabled'}
                      >
                        {rate.freelancer_sourced_rate}%
                      </td>
                    </tr>
                  )),
                )}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </>
  )
}
