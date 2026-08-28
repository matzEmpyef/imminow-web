import type { components } from '../api/schema'

/**
 * The study-level ladder, derived from the generated schema so it cannot drift from the contract.
 *
 * Closed on 2026-08-27. Before that this was free text everywhere, and the three surfaces that
 * wrote it had each invented their own spelling: the mobile onboarding wizard stored "Bachelor's"
 * (apostrophe) plus a "Foundation" the backend never knew, mobile search offered "Bachelors", and
 * this console let an admin type anything at all into ad targeting. The stored comparison value is
 * the lowercase slug, so every one of those wrote a value no filter could match — silently, with
 * no error and no empty-audience warning.
 */
export type StudyLevel = NonNullable<NonNullable<components['schemas']['Targeting']['study_level']>[number]>

export const STUDY_LEVELS: StudyLevel[] = ['10th', '11th', '12th', 'diploma', 'bachelors', 'masters', 'phd']

/** Display text. The wire values are lowercase slugs, which is not what an admin should read. */
export const STUDY_LEVEL_LABELS: Record<StudyLevel, string> = {
  '10th': '10th',
  '11th': '11th',
  '12th': '12th',
  diploma: 'Diploma',
  bachelors: 'Bachelors',
  masters: 'Masters',
  phd: 'PhD',
}

export const studyLevelLabel = (value: string) => STUDY_LEVEL_LABELS[value as StudyLevel] ?? value
