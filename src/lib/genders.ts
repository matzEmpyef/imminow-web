import type { components } from '../api/schema'

/**
 * Gender, derived from the generated schema so it cannot drift from the contract.
 *
 * Closed on 2026-08-27 alongside study_level, and for the same reason: it was free text, the mobile
 * profile offered "Female"/"Male"/"Other"/"Prefer not to say" while stored data was `male`/`female`,
 * and only case-insensitive comparison kept targeting working. "Prefer not to say" would have
 * stored a value no filter could ever express.
 */
export type Gender = NonNullable<NonNullable<components['schemas']['Targeting']['gender']>>

export const GENDERS: Gender[] = ['male', 'female', 'other', 'prefer_not_to_say']

export const GENDER_LABELS: Record<Gender, string> = {
  male: 'Male',
  female: 'Female',
  other: 'Other',
  prefer_not_to_say: 'Prefer not to say',
}

export const genderLabel = (value: string) => GENDER_LABELS[value as Gender] ?? value
