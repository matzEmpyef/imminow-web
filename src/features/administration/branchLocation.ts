import type { components } from '@/api/schema'

type Branch = components['schemas']['Branch']

/**
 * The branch location rules, kept out of the modal so they can be read and tested as rules rather
 * than as a render tree (same split `visitingHoursState.ts` and `courseFormShared.ts` already use).
 *
 * The server validates the four levels TOGETHER against the merged record and refuses 422 with a
 * plain message. These mirror the refusals the console can see coming, so the admin is told while
 * filling the field in instead of losing a round trip — the server's own message is still shown if
 * a case this file does not know about ever comes back.
 */
export interface BranchLocationDraft {
  country: string
  state: string
  district: string
  city: string
}

export interface BranchLocationErrors {
  state?: string
  district?: string
}

/**
 * India is the only country whose districts are modelled, which is why the requirement is keyed on
 * the country NAME and not on "the districts list came back non-empty": the server's rule is the
 * name, and a list that momentarily failed to load must not quietly turn a required field optional.
 */
export const DISTRICT_REQUIRED_COUNTRY = 'India'

export const emptyBranchLocation: BranchLocationDraft = { country: '', state: '', district: '', city: '' }

export function branchLocationOf(branch: Pick<Branch, 'country' | 'state' | 'district' | 'city'>): BranchLocationDraft {
  return {
    country: branch.country ?? '',
    state: branch.state ?? '',
    district: branch.district ?? '',
    city: branch.city ?? '',
  }
}

/**
 * What the form blocks on.
 *
 * NO COUNTRY IS NOT AN ERROR. Branches created before this feature carry no location at all and
 * must stay editable — refusing to save one would strand every legacy row the moment someone opened
 * it to rename it or switch it off. The Needs-attention queue is where those are chased, not here.
 */
export function branchLocationErrors(draft: BranchLocationDraft): BranchLocationErrors {
  const errors: BranchLocationErrors = {}
  if (!draft.country) return errors
  // "a country with no state" — a country on its own is not something the nearness ranking can use,
  // and the server refuses it.
  if (!draft.state) errors.state = 'Pick a state — a country on its own is refused.'
  if (draft.country === DISTRICT_REQUIRED_COUNTRY && !draft.district) {
    errors.district = 'A branch in India needs a district — students are matched to the nearest branch by it.'
  }
  return errors
}

export function branchLocationIsValid(draft: BranchLocationDraft): boolean {
  return Object.keys(branchLocationErrors(draft)).length === 0
}

export function sameBranchLocation(a: BranchLocationDraft, b: BranchLocationDraft): boolean {
  return a.country === b.country && a.state === b.state && a.district === b.district && a.city.trim() === b.city.trim()
}

/**
 * The four fields as the write wants them. Clearing the country clears the whole location, which is
 * the server's own rule — a state or district with no country behind it cannot be checked against
 * any list and is not a fact on its own.
 */
export function branchLocationBody(draft: BranchLocationDraft): {
  country: string | null
  state: string | null
  district: string | null
  city: string | null
} {
  if (!draft.country) return { country: null, state: null, district: null, city: null }
  return {
    country: draft.country,
    state: draft.state || null,
    district: draft.district || null,
    city: draft.city.trim() || null,
  }
}

/**
 * The same place as `POST /consultancies` wants the HEAD OFFICE's (2026-09-21) — `branch_`
 * prefixed, and every level OMITTED rather than sent null when it is empty.
 *
 * That is the one real difference from {@link branchLocationBody}, and it is load-bearing twice
 * over. `branch_city` DEFAULTS server-side to the account's own required `city`, and the server
 * reads "the field is absent" as "use the default" — `branch_city: null` is a different request
 * that means "no city at all", which would throw away the one fact we were definitely told.
 * `branch_country: null` on an endpoint that has no existing record to clear is likewise noise: a
 * create either names a place or does not mention one.
 *
 * A state or district with no country is dropped rather than sent: it cannot be checked against
 * any list, and the server refuses it. The cascade in `BranchPlaceFields` already clears both when
 * the country changes, so this only matters if a caller ever hands over a draft it did not build.
 */
export function headOfficeBranchFields(draft: BranchLocationDraft): {
  branch_country?: string
  branch_state?: string
  branch_district?: string
  branch_city?: string
} {
  const fields: {
    branch_country?: string
    branch_state?: string
    branch_district?: string
    branch_city?: string
  } = {}
  if (draft.country) {
    fields.branch_country = draft.country
    if (draft.state) fields.branch_state = draft.state
    if (draft.district) fields.branch_district = draft.district
  }
  const city = draft.city.trim()
  if (city) fields.branch_city = city
  return fields
}

/** True once a branch carries enough for the student-facing nearness ranking to place it. */
export function branchHasLocation(branch: Pick<Branch, 'country' | 'state' | 'district' | 'city'>): boolean {
  return Boolean(branch.country && branch.state)
}

/** "Bengaluru, Bengaluru Urban, Karnataka, India" — narrowest first, the way an address reads. */
export function formatBranchLocation(
  branch: Pick<Branch, 'country' | 'state' | 'district' | 'city'>,
): string {
  return [branch.city, branch.district, branch.state, branch.country].filter(Boolean).join(', ')
}
