import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { Card } from './Card'

/**
 * The console's one "you can't open this page" card. A page a signed-in person is not allowed to
 * use says so, in the same words every time, with a way back. It never sends them away silently.
 */
export function NoAccessCard({
  detail,
  backTo,
  backLabel,
}: {
  /** One plain sentence on why, or what to do about it. */
  detail?: ReactNode
  backTo: string
  backLabel: string
}) {
  return (
    <Card>
      <p className="text-body text-text-primary">You don&rsquo;t have access to this page.</p>
      {detail && <p className="mt-xs text-body-sm text-text-secondary">{detail}</p>}
      <Link to={backTo} className="mt-md inline-block text-body-sm font-medium text-primary hover:underline">
        {backLabel}
      </Link>
    </Card>
  )
}
