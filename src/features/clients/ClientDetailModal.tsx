import { Link } from 'react-router-dom'
import { Modal } from '@/components/Modal'
import { Badge } from '@/components/Badge'
import { StudentProfileFields } from '@/components/StudentProfileFields'
import type { components } from '@/api/schema'

type Client = components['schemas']['Client']

const STATUS_LABEL: Record<string, string> = {
  pending_plan_assignment: 'Pending plan assignment',
  in_plan: 'In plan',
  plan_complete: 'Plan complete',
  closed: 'Closed',
  closed_completed: 'Completed',
}

/**
 * The applicant's profile as it matters for picking a college/course, without leaving Course
 * Finder (user, 2026-08-24: "should show information collected in profile that is useful to
 * select college and course... no need of name, email or phone number... Also have a link to
 * applicant['s] profile"). Everything else about the case — file number, address, plan, billing —
 * lives on the real Client Profile page, one click away via the link at the bottom; this popup is
 * reached mid-search and stays scoped to what a consultant would actually check before
 * shortlisting a course, not a general case summary.
 */
export function ClientDetailModal({ client, onClose }: { client: Client; onClose: () => void }) {
  return (
    <Modal onClose={onClose} title={`${client.student.first_name} ${client.student.last_name}`} widthRem={30}>
      <div className="flex flex-col gap-md">
        <div className="flex flex-wrap items-center gap-xs">
          <Badge color="primary">{STATUS_LABEL[client.status] ?? client.status}</Badge>
          {client.unattended && <Badge color="warning">Pending Response</Badge>}
        </div>

        <dl className="flex flex-col gap-xs text-body-sm">
          <div className="flex items-start justify-between gap-md">
            <dt className="shrink-0 text-text-secondary">Finalized country</dt>
            <dd className="min-w-0 text-right text-text-primary">
              {client.finalized_country ?? <span className="text-text-secondary">Not finalized yet</span>}
            </dd>
          </div>
        </dl>

        <div className="flex flex-col gap-xs border-t border-border pt-sm">
          <span className="text-body-sm font-medium text-text-primary">Profile</span>
          <StudentProfileFields prefs={client.preferences} />
        </div>

        <Link to={`/clients/${client.id}`} className="text-body-sm text-primary hover:underline">
          View full profile →
        </Link>
      </div>
    </Modal>
  )
}
