import { Link } from 'react-router-dom'
import { ArrowUpRight, UserX } from 'lucide-react'
import { Modal } from '@/components/Modal'
import { Badge } from '@/components/Badge'
import { StudentProfilePanels } from '@/components/StudentProfileFields'
import type { components } from '@/api/schema'

type Lead = components['schemas']['Lead']

/**
 * Same job as ClientDetailModal, for a lead (user, 2026-08-24: "For both applicant and leads").
 * An imported lead has no linked Sentpo account, so there is no profile to show at all — that
 * gets its own message rather than a wall of "Not added yet" tiles, which would misleadingly
 * suggest an account exists and is simply empty.
 *
 * Restyled 2026-09-10 alongside the client popup: identity header, completeness bar, panels.
 */
export function LeadDetailModal({
  lead,
  onClose,
  showProfileLink = true,
}: {
  lead: Lead
  onClose: () => void
  /** False from Lead Pool, where there is no lead page to go to (user, 2026-09-10). */
  showProfileLink?: boolean
}) {
  const imported = lead.origin === 'imported'

  const header = (
    <div className="flex min-w-0 flex-1 items-center gap-md">
      <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-h2 font-semibold text-primary">
        {lead.name.charAt(0).toUpperCase()}
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-xs">
        <h2 className="truncate text-h2 text-text-primary">{lead.name}</h2>
        <div className="flex flex-wrap items-center gap-xs">
          <Badge color="info">Lead</Badge>
          <Badge color="primary" className="capitalize">
            {lead.status}
          </Badge>
          {lead.unattended && <Badge color="warning">Pending Response</Badge>}
          <span className="text-caption text-text-secondary">{imported ? 'Self-sourced' : 'From the Sentpo app'}</span>
        </div>
      </div>
      {showProfileLink && (
        <Link
          to={`/sales/leads/${lead.id}`}
          className="inline-flex h-10 shrink-0 items-center gap-xs rounded-full border border-primary px-md text-button font-medium text-primary hover:bg-primary/10"
        >
          View full profile
          <ArrowUpRight className="h-4 w-4" aria-hidden />
        </Link>
      )}
    </div>
  )

  return (
    <Modal onClose={onClose} title={lead.name} header={header} widthRem={44} dismissible>
      {imported ? (
        <div className="flex items-start gap-sm rounded-lg border border-border bg-background p-lg">
          <UserX className="mt-0.5 h-5 w-5 shrink-0 text-text-secondary" aria-hidden />
          <p className="text-body-sm text-text-secondary">
            Self-sourced lead — no linked Sentpo account, so there is no profile on file.
          </p>
        </div>
      ) : (
        <StudentProfilePanels prefs={lead.preferences} />
      )}
    </Modal>
  )
}
