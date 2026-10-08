import { requestReference } from '@/api/errors'
import { CopyButton } from './CopyButton'

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
    <span className={`flex items-center gap-xs text-caption text-text-secondary ${className}`}>
      <span className="min-w-0 break-all">
        Reference: <span className="select-all font-mono">{reference}</span>
      </span>
      {/* One click copies it for a message to support; the text can still be selected by hand. */}
      <CopyButton value={reference} kind="reference" />
    </span>
  )
}
