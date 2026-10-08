import type { components } from '@/api/schema'

type KycStatus = components['schemas']['KycStatus']

/**
 * The submitted certificate, shown as what it is (review F-066): an image is shown in place (and
 * opens full size in a new tab), a PDF is a link that opens in a new tab. `document_url` is an
 * EXPIRING link issued afresh on every read, so it is used as it arrives and never kept.
 *
 * One component for the consultancy's own card and the platform's review row, so both read a new
 * file type the same way. A record from before the type was sent (no `document_content_type`) is a
 * plain link, as it always was.
 */
export function KycDocument({
  kyc,
  label,
  size = 'md',
}: {
  kyc: Pick<KycStatus, 'document_url' | 'document_content_type'> | undefined
  /** What the document is called here: "certificate", or "document" for an institute. */
  label: string
  size?: 'sm' | 'md'
}) {
  if (!kyc?.document_url) return null
  const type = kyc.document_content_type ?? ''

  if (type.startsWith('image/')) {
    return (
      <a href={kyc.document_url} target="_blank" rel="noreferrer" className="block w-fit" title="Open full size">
        <img
          src={kyc.document_url}
          alt={`Submitted ${label}`}
          className={`${size === 'sm' ? 'h-14 w-24' : 'h-32 w-48'} rounded-md border border-border bg-background object-cover`}
        />
      </a>
    )
  }
  return (
    <a
      href={kyc.document_url}
      target="_blank"
      rel="noreferrer"
      className={`w-fit ${size === 'sm' ? 'text-caption' : 'text-body-sm'} text-primary underline`}
    >
      View submitted {label}
      {type === 'application/pdf' ? ' (PDF)' : ''}
    </a>
  )
}
