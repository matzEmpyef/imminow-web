// The one place a campus gets its label (owner, 2026-10-09). A campus may carry its own name
// ("Toronto Downtown"); one that never got a name is shown by its city, and is therefore one per
// city in its college. Every list, chip, picker and table in the console goes through here, so a
// campus reads the same wherever it appears.
export interface CampusLike {
  // What the server says to show the campus as (name, else city); read-only, always sent by the
  // backend. An object without it (an older answer, a half-built row) gets the same rule below.
  label?: string | null
  name?: string | null
  city?: string | null
  province_state?: string | null
  country?: string | null
}

function clean(value: string | null | undefined): string {
  return value?.trim() ?? ''
}

function place(campus: CampusLike): string {
  return [campus.city, campus.province_state, campus.country].map(clean).filter(Boolean).join(', ')
}

/**
 * The server's `label` when it sent one; otherwise the campus's name when it has one, else its city (the contract's fallback is "city (or
 * province)"; a campus with neither falls to its country, never to a blank).
 *
 * `withPlace` is for pickers and lists that need to tell campuses apart at a glance: a named
 * campus reads "Toronto Downtown — Toronto, Ontario, Canada"; an unnamed one reads
 * "Toronto, Ontario, Canada".
 */
export function campusLabel(campus: CampusLike, options?: { withPlace?: boolean }): string {
  const name = clean(campus.name)
  const short = clean(campus.label) || name || clean(campus.city) || clean(campus.province_state) || clean(campus.country)
  if (!options?.withPlace) return short
  const where = place(campus)
  if (name) return where ? `${name} — ${where}` : name
  return where || short
}

export interface CourseCampusLike {
  // The server's read-only line for a course's place: the one campus's name (else its city), or
  // the first campus's city when the course has several; null when no campus is switched on.
  campus_label?: string | null
  campus_city?: string | null
}

/**
 * What to write after a college's name as a course's place. The served `campus_label` when there
 * is one, else `campus_city` (an older answer, a half-built row); an empty string when the course
 * has neither, so callers can test it and never print a dangling comma.
 */
export function courseCampusLabel(course: CourseCampusLike): string {
  return clean(course.campus_label) || clean(course.campus_city)
}

/**
 * Where a college is, in a line for a picker: its cities, then its countries ("Dublin, Cork ·
 * Ireland"). Colleges with near-identical names are told apart by this (T4-19). Empty when the
 * college has no campus and no country on record.
 */
export function collegePlaceLine(college: {
  campuses?: ReadonlyArray<CampusLike> | null
  countries?: ReadonlyArray<string> | null
}): string {
  const cities = Array.from(new Set((college.campuses ?? []).map((c) => clean(c.city)).filter(Boolean)))
  const shown = cities.length > 3 ? `${cities.slice(0, 3).join(', ')} and ${cities.length - 3} more` : cities.join(', ')
  const countries = Array.from(
    new Set([...(college.countries ?? []), ...(college.campuses ?? []).map((c) => c.country ?? '')].map(clean).filter(Boolean)),
  ).join(', ')
  return [shown, countries].filter(Boolean).join(' · ')
}
