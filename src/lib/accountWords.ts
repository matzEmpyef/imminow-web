import { useMyConsultancy } from '@/queries/consultancy'

/**
 * The words an account calls itself by (console review H2, 2026-09-13).
 *
 * A university on an `institute` account was told it was a "consultancy" everywhere — its own
 * admin read "Consultancy Admin", its dashboard offered "Whole Consultancy", its lists had a
 * "Consultant" column for people who are not consultants. `kind` already distinguishes the two
 * account types server-side; this is the ONE place the console turns that into vocabulary, so a
 * new screen picks up the right nouns instead of hard-coding a third variant of the same rename.
 *
 * Deliberately not a translation layer: only the handful of nouns that actually read wrong for a
 * college live here. Proper names (the sidebar's "Consultancy Management") stay as they are.
 *
 * `options.enabled` forwards to `useMyConsultancy` for the one caller (My Account) that serves
 * every role — the route 403s for platform staff and freelancers, who never see these words.
 */
export interface AccountWords {
  isInstitute: boolean
  /** Lowercase noun for the organisation, mid-sentence. */
  org: 'consultancy' | 'institute'
  /** Capitalised noun for the organisation, at the start of a sentence or in a label. */
  Org: 'Consultancy' | 'Institute'
  /** Lowercase noun for a staff member who carries leads and cases. */
  person: 'consultant' | 'team member'
  /** Capitalised noun for a staff member. */
  Person: 'Consultant' | 'Team member'
  /** The dashboard scope covering everyone in the account. */
  wholeLabel: 'Whole Consultancy' | 'Whole Institute'
  /** The `consultancy_admin` role, as this account reads it. */
  adminLabel: 'Consultancy Admin' | 'Institute Admin'
}

export function useAccountWords(options: { enabled?: boolean } = {}): AccountWords {
  const isInstitute = useMyConsultancy(options).data?.kind === 'institute'
  return {
    isInstitute,
    org: isInstitute ? 'institute' : 'consultancy',
    Org: isInstitute ? 'Institute' : 'Consultancy',
    person: isInstitute ? 'team member' : 'consultant',
    Person: isInstitute ? 'Team member' : 'Consultant',
    wholeLabel: isInstitute ? 'Whole Institute' : 'Whole Consultancy',
    adminLabel: isInstitute ? 'Institute Admin' : 'Consultancy Admin',
  }
}
