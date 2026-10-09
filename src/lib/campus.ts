// The one place a campus gets its label (owner, 2026-10-09). A campus may carry its own name
// ("Toronto Downtown"); one that never got a name is shown by its city, and is therefore one per
// city in its college. Every list, chip, picker and table in the console goes through here, so a
// campus reads the same wherever it appears.
export interface CampusLike {
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
 * The campus's name when it has one, otherwise its city (the contract's fallback is "city (or
 * province)"; a campus with neither falls to its country, never to a blank).
 *
 * `withPlace` is for pickers and lists that need to tell campuses apart at a glance: a named
 * campus reads "Toronto Downtown — Toronto, Ontario, Canada"; an unnamed one reads
 * "Toronto, Ontario, Canada".
 */
export function campusLabel(campus: CampusLike, options?: { withPlace?: boolean }): string {
  const name = clean(campus.name)
  const short = name || clean(campus.city) || clean(campus.province_state) || clean(campus.country)
  if (!options?.withPlace) return short
  const where = place(campus)
  if (name) return where ? `${name} — ${where}` : name
  return where || short
}
