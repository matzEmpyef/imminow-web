import { hoursInWords } from '@/lib/duration'

/**
 * Fields the server sends since Phase 8 Tier 4 that the generated API types do not carry yet, each
 * read through one small function so a screen asks for text and gets text or null. After the
 * contract join the generated types have them: each function below then takes the generated type
 * and drops its cast (nothing else in the console reads these fields).
 */

function textOf(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value : null
}

/**
 * T4-31: what to call a featured pick on App Config. The platform settings read for platform staff
 * carries `featured_labels`, each featured id mapped to its name, or to "No longer available" where
 * the record is gone. Null for an id the map does not name (and for a read without the map).
 */
// replace with generated type after the contract join
export function featuredLabelOf(settings: object | null | undefined, id: string): string | null {
  const labels = (settings as { featured_labels?: Record<string, unknown> | null } | null | undefined)?.featured_labels
  return labels && typeof labels === 'object' ? textOf(labels[id]) : null
}

/**
 * T4-34: a median response time as the server writes it ("119 days 6 hours", "Under an hour"),
 * from `response_time_median_text` on the League row and on the dashboard's analytics. When the
 * server sent no text the console's own wording (`lib/duration.ts`) is used; null when there is no
 * figure at all.
 */
// replace with generated type after the contract join
export function responseTimeTextOf(
  figures: { response_time_median_hours?: number | null } | null | undefined,
): string | null {
  const served = textOf((figures as { response_time_median_text?: unknown } | null | undefined)?.response_time_median_text)
  if (served) return served
  const hours = figures?.response_time_median_hours
  return typeof hours === 'number' ? hoursInWords(hours) : null
}
