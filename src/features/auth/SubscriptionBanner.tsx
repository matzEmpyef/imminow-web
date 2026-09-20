import type { ReactNode } from 'react'
import { AlertTriangle, Clock } from 'lucide-react'
import { Button } from '@/components/Button'
import { useMyConsultancy, useRequestRenewal } from '@/queries/consultancy'
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

// C7 (2026-09-13): every one of these notices used to end in "Contact immiNow to renew" — an
// instruction to leave the product to do the one thing it was telling the admin to do. The admin
// now asks from here, and once asked the notice says so rather than repeating the ask: the answer
// comes from the RECORDED `renewal_requested_at`, so it survives a reload and a second session.
function RenewalAction({ requestedAt }: { requestedAt?: string | null }) {
  const requestRenewal = useRequestRenewal()
  if (requestedAt) {
    return <>Renewal requested on {formatDate(requestedAt)} — immiNow will contact you.</>
  }
  return (
    <>
      <Button
        size="sm"
        className="ml-xs align-middle"
        loading={requestRenewal.isPending}
        onClick={() => requestRenewal.mutate()}
      >
        Request renewal
      </Button>
      {requestRenewal.isError && <span className="ml-xs text-error">{requestRenewal.error.message}</span>}
    </>
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
  // One sentence for everyone who cannot act on this themselves, in every state — it was three
  // different sentences before, one of which told a consultant to contact immiNow directly.
  const askYourAdmin = 'Ask your admin to renew it with immiNow.'

  if (status === 'expiring') {
    // Still hidden from non-admins (nothing is wrong yet, and they have nothing to do about it).
    if (!isAdmin) return null
    return (
      <Notice tone="info">
        Your subscription ends on <strong>{expires}</strong>. <RenewalAction requestedAt={data.renewal_requested_at} />
      </Notice>
    )
  }
  if (status === 'grace') {
    return (
      <Notice tone="warning">
        Your subscription expired on <strong>{expires}</strong>. Unless it is renewed by <strong>{graceEnds}</strong>,
        only admins will be able to sign in, and new leads and new clients will stop.{' '}
        {isAdmin ? <RenewalAction requestedAt={data.renewal_requested_at} /> : askYourAdmin}
      </Notice>
    )
  }
  // Explicit, never a catch-all (assumptions audit M34, product owner 2026-09-19): this used to
  // be the `else` of the expiring/grace branches, so a status newer than this build told a whole
  // consultancy its subscription had lapsed. Saying nothing is the only honest fallback here —
  // the server enforces the real consequence either way, and Manage Consultancies names the
  // status for whoever can act on it.
  if (status !== 'lapsed') return null
  return (
    <Notice tone="error">
      Your subscription has lapsed. Only admins can sign in, and new leads and new clients are paused — you can still
      serve your existing clients. Your team can sign in again as soon as it is renewed.{' '}
      {isAdmin ? <RenewalAction requestedAt={data.renewal_requested_at} /> : askYourAdmin}
    </Notice>
  )
}
