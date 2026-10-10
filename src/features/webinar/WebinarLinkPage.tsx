import { useEffect, type ReactNode } from 'react'
import { AlertCircle, CheckCircle2 } from 'lucide-react'
import { PublicPageShell } from '@/components/PublicPageShell'
import { Skeleton } from '@/components/QueryState'
import { useLinkToken } from '@/lib/linkToken'
import { goTo, isWebAddress } from '@/lib/externalRedirect'
import { useWebinarLinkAttend } from '@/queries/webinarLink'

// How long the "Taking you to ..." line stays up before the browser moves on: long enough to read
// the points line, short enough not to feel stuck.
const REDIRECT_DELAY_MS = 1500

/**
 * The page the webinar email's button opens: `/webinar#<token>` (owner's ruling 2026-10-10).
 * Public, no account. It reads the token from the address once (and takes it out of the address,
 * F-123), asks the server to record the student's attendance, and sends them on to the meeting.
 * A refusal is shown as the server wrote it, for the student, with no meeting address and no retry:
 * the link works once, and a refusal before the start spends nothing, so opening the email's button
 * again is the way to try again.
 */
export function WebinarLinkPage() {
  const token = useLinkToken('/webinar')
  const attend = useWebinarLinkAttend(token)
  const answer = attend.data
  const redirectUrl = answer && isWebAddress(answer.redirect_url) ? answer.redirect_url : null

  useEffect(() => {
    if (!redirectUrl) return
    const timer = window.setTimeout(() => goTo(redirectUrl), REDIRECT_DELAY_MS)
    return () => window.clearTimeout(timer)
  }, [redirectUrl])

  if (!token) {
    return (
      <PublicPageShell title="This link can't be opened">
        <Problem>This link is not valid. Ask for the webinar link again from the Sentpo app.</Problem>
      </PublicPageShell>
    )
  }

  if (attend.isPending) {
    return (
      <PublicPageShell title="Opening your webinar…">
        <Skeleton className="h-10 rounded-md" />
      </PublicPageShell>
    )
  }

  if (attend.isError) {
    return (
      <PublicPageShell title="This link can't be opened">
        <Problem>{attend.error.message}</Problem>
        <p className="text-caption text-text-secondary">You can close this page.</p>
      </PublicPageShell>
    )
  }

  if (!redirectUrl) {
    return (
      <PublicPageShell title="This link can't be opened">
        <Problem>This webinar has no meeting address we can open. Ask for the link again from the Sentpo app.</Problem>
      </PublicPageShell>
    )
  }

  const points = answer?.points_awarded ?? 0
  return (
    <PublicPageShell title={`Taking you to ${answer?.event_title}…`}>
      <p role="status" className="flex items-start gap-sm text-body text-text-primary">
        <CheckCircle2 className="mt-[2px] h-5 w-5 shrink-0 text-success" aria-hidden />
        <span>
          You are counted as attending.
          {points > 0 && (
            <>
              {' '}
              You earned {points} {points === 1 ? 'point' : 'points'}.
            </>
          )}
        </span>
      </p>
      <p className="text-caption text-text-secondary">
        Not moving?{' '}
        <a href={redirectUrl} className="text-primary underline">
          Open the webinar
        </a>
        .
      </p>
    </PublicPageShell>
  )
}

function Problem({ children }: { children: ReactNode }) {
  return (
    <p role="alert" className="flex items-start gap-sm text-body text-text-primary">
      <AlertCircle className="mt-[2px] h-5 w-5 shrink-0 text-error" aria-hidden />
      <span>{children}</span>
    </p>
  )
}
