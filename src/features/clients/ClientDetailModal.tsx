import { Link } from 'react-router-dom'
import { ArrowUpRight } from 'lucide-react'
import { Modal } from '@/components/Modal'
import { CountryLabel } from '@/components/CountryLabel'
import { Badge } from '@/components/Badge'
import { FinalizedCountryIcon, StudentProfilePanels } from '@/components/StudentProfileFields'
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
 * applicant['s] profile"). Everything else about the case — address, plan, billing — lives on the
 * real Client Profile page, one click away via the header link.
 *
 * Restyled 2026-09-10 to match the course and college popups ("can you improve this UI too"):
 * identity header, a completeness bar, and Study Plan / Background / About panels.
 */
export function ClientDetailModal({ client, onClose }: { client: Client; onClose: () => void }) {
  const name = `${client.student.first_name} ${client.student.last_name}`

  const header = (
    <div className="flex min-w-0 flex-1 items-center gap-md">
      <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-h2 font-semibold text-primary">
        {client.student.first_name.charAt(0).toUpperCase()}
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-xs">
        <h2 className="truncate text-h2 text-text-primary">{name}</h2>
        <div className="flex flex-wrap items-center gap-xs">
          <Badge color="secondary">Applicant</Badge>
          <Badge color="primary">{STATUS_LABEL[client.status] ?? client.status}</Badge>
          {client.unattended && <Badge color="warning">Pending Response</Badge>}
          {client.file_number && <span className="text-caption text-text-secondary">{client.file_number}</span>}
        </div>
      </div>
      <Link
        to={`/clients/${client.id}`}
        className="inline-flex h-10 shrink-0 items-center gap-xs rounded-full border border-primary px-md text-button font-medium text-primary hover:bg-primary/10"
      >
        View full profile
        <ArrowUpRight className="h-4 w-4" aria-hidden />
      </Link>
    </div>
  )

  return (
    <Modal onClose={onClose} title={name} header={header} widthRem={44} dismissible>
      <StudentProfilePanels
        prefs={client.preferences}
        extraStudyFacts={[
          {
            label: 'Finalized country',
            icon: <FinalizedCountryIcon className="h-5 w-5" />,
            color: 'success',
            lines: client.finalized_country ? [<CountryLabel key="c" name={client.finalized_country} />] : null,
          },
        ]}
      />
    </Modal>
  )
}
