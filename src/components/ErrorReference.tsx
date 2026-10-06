import { requestReference } from '@/api/errors'

/**
 * The request reference of a failed request, when it has one (review F-162): the one thing
 * support needs to find what happened in the server's log, which no screen used to show. Renders
 * nothing for an error without one, so it can sit under any error message unconditionally.
 *
 * Shown by the three shared places a failure appears — the error state (`ErrorState`), a table's
 * error row (`Table`) and the error toast — and usable under a form's own message.
 */
export function ErrorReference({ error, className = '' }: { error: unknown; className?: string }) {
  const reference = requestReference(error)
  if (!reference) return null
  return <ReferenceLine reference={reference} className={className} />
}

export function ReferenceLine({ reference, className = '' }: { reference: string; className?: string }) {
  return (
    <span className={`block text-caption text-text-secondary ${className}`}>
      Reference: <span className="select-all font-mono">{reference}</span>
    </span>
  )
}
