import { AdminShell } from '@/features/auth/AdminShell'
import { ExchangeRatesTab } from './ExchangeRatesTab'

/**
 * Finance → Exchange Rates. The rates editor moved here from Settings because only staff with the
 * `finance` permission may change a rate; Settings still lists them, read-only unless the viewer
 * also holds `finance`. The route is gated on `finance`, so everyone who reaches this can edit.
 */
export function ExchangeRatesPage() {
  return (
    <AdminShell>
      <div className="flex flex-col gap-lg">
        <h1 className="text-h1 text-text-primary">Exchange Rates</h1>
        <ExchangeRatesTab />
      </div>
    </AdminShell>
  )
}
