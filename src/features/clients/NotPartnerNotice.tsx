import { Link } from 'react-router-dom'
import { PARTNER_COLLEGES_PATH } from './partnerStatus'


/** The sentence, with the route to Partner Colleges. */
export function NotPartnerNotice({ collegeName, className }: { collegeName?: string | null; className?: string }) {
  return (
    <p className={className ?? 'text-body-sm text-warning'} role="status">
      {collegeName ?? 'This college'} is not one of your Partner Colleges, so an offer from it cannot be accepted
      yet. Add it under Partner Colleges first.{' '}
      <Link to={PARTNER_COLLEGES_PATH} className="font-medium underline">
        Open Partner Colleges
      </Link>
    </p>
  )
}
