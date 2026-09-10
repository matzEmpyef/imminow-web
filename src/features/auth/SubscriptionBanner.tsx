import type { ReactNode } from 'react'
import { AlertTriangle, Clock } from 'lucide-react'
import { useMyConsultancy } from '@/queries/consultancy'
import { usePermissionChecker } from '@/lib/permissions'
import { formatDate } from '@/lib/time'

// The consultancy console's subscription notice (2026-09-10, user: "14 days grace, keep serving
// existing clients, super admin renews" and "after 14 days let only admin login"). The server
// derives `subscription_status` and enforces every consequence; this only says what is happening
// and what to do, to the people who can act on it:
//   - expiring (30 days or fewer): admins only — nothing is wrong yet, the team need not be told;
//   - grace: everyone, since the whole team is about to be locked out;
//   - lapsed: only admins can be signed in by then, so it speaks to them.
function Notice({ tone, children }: { tone: 'info' | 'warning' | 'error'; children: ReactNode }) {
  const styles = {
    info: 'border-border bg-primary/5 text-text-primary',
    warning: 'border-warning bg-warning/10 text-text-primary',
    error: 'border-error bg-error/10 text-text-primary',
  }[tone]
  const Icon = tone === 'info' ? Clock : AlertTriangle
  const iconColor = tone === 'info' ? 'text-primary' : tone === 'warning' ? 'text-warning' : 'text-error'
  return (
    <div role="status" className={`mb-lg flex items-start gap-sm rounded-md border px-md py-sm text-body-sm ${styles}`}>
      <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${iconColor}`} aria-hidden />
      <p>{children}</p>
    </div>
  )
}

export function SubscriptionBanner() {
  const { data } = useMyConsultancy()
  const { can } = usePermissionChecker()
  const status = data?.subscription_status
  if (!data || !status || status === 'active' || status === 'none') return null

  const isAdmin = can('settings.edit_profile')
  const expires = data.subscription_expires_at ? formatDate(data.subscription_expires_at) : 'its end date'
  const graceEnds = data.grace_ends_at ? formatDate(data.grace_ends_at) : 'the end of the grace period'

  if (status === 'expiring') {
    if (!isAdmin) return null
    return (
      <Notice tone="info">
        Your subscription ends on <strong>{expires}</strong>. Contact immiNow to renew so nothing is interrupted.
      </Notice>
    )
  }
  if (status === 'grace') {
    return (
      <Notice tone="warning">
        Your subscription expired on <strong>{expires}</strong>. Unless it is renewed by <strong>{graceEnds}</strong>,
        only admins will be able to sign in, and new leads and new clients will stop.{' '}
        {isAdmin ? 'Contact immiNow to renew.' : 'Ask your admin to renew it with immiNow.'}
      </Notice>
    )
  }
  return (
    <Notice tone="error">
      Your subscription has lapsed. Only admins can sign in, and new leads and new clients are paused — you can still
      serve your existing clients. Contact immiNow to renew; your team can sign in again as soon as it is renewed.
    </Notice>
  )
}
