import { Link } from 'react-router-dom'
import { Modal } from '@/components/Modal'
import { Badge } from '@/components/Badge'
import { StudentProfileFields } from '@/components/StudentProfileFields'
import type { components } from '@/api/schema'

type Lead = components['schemas']['Lead']

/**
 * Same job as ClientDetailModal, for a lead (user, 2026-08-24: "For both applicant and leads").
 * An imported lead has no linked Sentpo account, so there is no profile to show at all — that
 * gets its own message rather than a wall of "Not added yet" rows, which would misleadingly
 * suggest an account exists and is simply empty.
 */
export function LeadDetailModal({ lead, onClose }: { lead: Lead; onClose: () => void }) {
  return (
    <Modal onClose={onClose} title={lead.name} widthRem={30}>
      <div className="flex flex-col gap-md">
        <div className="flex flex-wrap items-center gap-xs">
          <Badge color="primary" className="capitalize">
            {lead.status}
          </Badge>
          {lead.unattended && <Badge color="warning">Pending Response</Badge>}
        </div>

        {lead.origin === 'imported' ? (
          <p className="text-body-sm text-text-secondary">
            Self-sourced lead — no linked Sentpo account, so there is no profile on file.
          </p>
        ) : (
          <div className="flex flex-col gap-xs border-t border-border pt-sm">
            <span className="text-body-sm font-medium text-text-primary">Profile</span>
            <StudentProfileFields prefs={lead.preferences} />
          </div>
        )}

        <Link to={`/sales/leads/${lead.id}`} className="text-body-sm text-primary hover:underline">
          View full profile →
        </Link>
      </div>
    </Modal>
  )
}
