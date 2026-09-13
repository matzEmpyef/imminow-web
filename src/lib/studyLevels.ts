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

// A COURSE's level, which is a different reading of the same codes (console review M14,
// 2026-09-13). A student says they hold a Bachelor's; a course is a Bachelors programme — the
// possessive belongs to the person, not to the programme, and the console's course pickers have
// always been worded this way. Kept beside the student map rather than in a second file so the
// difference is a deliberate line of code instead of two screens quietly drifting.
//
// The OPTIONS now come from `GET /courses/levels` (whatever the caller's catalogue actually
// holds), so this map only labels them — an unlabelled code must still read as a word, hence the
// title-cased fallback rather than a raw slug.
export const COURSE_LEVEL_LABELS: Record<string, string> = {
  diploma: 'Diploma',
  bachelors: 'Bachelors',
  masters: 'Masters',
  phd: 'PhD',
  certificate: 'Certificate',
}

export function courseLevelLabel(code: string | null | undefined): string {
  if (!code) return ''
  return (
    COURSE_LEVEL_LABELS[code] ??
    code
      .replace(/[_-]+/g, ' ')
      .replace(/\b[a-z]/g, (c) => c.toUpperCase())
  )
}
