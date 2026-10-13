import { Link } from 'react-router-dom'
import { useAccountWords } from '@/lib/accountWords'
import { usePartnerColleges } from '@/queries/partnerColleges'

/**
 * Whether a college is one of this consultancy's Partner Colleges, for the screens that move an
 * application towards an acceptance (T4-19). The server refuses an acceptance from any other
 * college, which used to be found out at the last click. "unknown" while the list is loading or
 * is not allowed for this person, so nothing is said that might not be true. An institute is its
 * own college, so the question does not arise.
 */
export function usePartnerStatus(collegeId: string | null | undefined): 'partner' | 'not-partner' | 'unknown' {
  const partners = usePartnerColleges()
  const { isInstitute } = useAccountWords()
  if (isInstitute || !collegeId || !partners.data) return 'unknown'
  return partners.data.some((p) => p.college_id === collegeId && p.active !== false) ? 'partner' : 'not-partner'
}

export const PARTNER_COLLEGES_PATH = '/administration/consultancy-profile?tab=partner-colleges'

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
