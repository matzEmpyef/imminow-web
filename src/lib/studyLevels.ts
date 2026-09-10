// `study_level` is a closed wire enum (10th/11th/12th/diploma/bachelors/masters/phd), labelled
// here rather than shown raw. Shared so every surface that shows a student's level — the profile
// fields, the Lead Pool table — reads it the same way; a second hand-rolled copy is how two
// screens end up disagreeing about what "masters" is called.
export const STUDY_LEVEL_LABELS: Record<string, string> = {
  '10th': '10th',
  '11th': '11th',
  '12th': '12th',
  diploma: 'Diploma',
  bachelors: "Bachelor's",
  masters: "Master's",
  phd: 'PhD',
}

export function studyLevelLabel(slug: string | null | undefined): string | null {
  if (!slug) return null
  return STUDY_LEVEL_LABELS[slug] ?? slug
}
