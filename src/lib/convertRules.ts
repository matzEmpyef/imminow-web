import { useFeature } from '@/lib/features'
import { usePermissionChecker } from '@/lib/permissions'

/** The staff permission that allows turning a lead into a client. */
export const CONVERT_PERMISSION = 'leads.convert'

interface LeadForConvert {
  origin?: string | null
}

/**
 * Whether the signed-in person may convert this lead into a client: send it the offer ("Convert
 * to Client"), and approve or decline a student's own request (owner decision 6; review F-055,
 * 2026-10-07). ONE rule for both, so the two controls on the lead page cannot disagree.
 *
 * What the server checks, and so what is checked here:
 *
 *   - the `leads.convert` permission, always;
 *   - for a lead the consultancy added itself (`origin: imported`), converting creates an account
 *     and a case, which is Create Applicant by another door: it also needs the
 *     `clients.create_applicant` permission and the `create_applicant` plan feature.
 *
 * Sight of the lead is not checked here: a person who cannot see a lead never reaches its page
 * (the server answers 404). Fails closed, like every permission check: false until `GET /me` has
 * answered.
 */
export function useCanConvertLead(lead: LeadForConvert | null | undefined): boolean {
  const { can } = usePermissionChecker()
  const planHasCreateApplicant = useFeature('create_applicant')
  if (!can(CONVERT_PERMISSION)) return false
  if (lead?.origin !== 'imported') return true
  return planHasCreateApplicant && can('clients.create_applicant')
}
