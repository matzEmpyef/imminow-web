import type { components } from '@/api/schema'
import { hoursInWords } from '@/lib/duration'

/**
 * Fields the server sends since Phase 8 Tier 4, each read through one small function so a screen
 * asks for text and gets text or null.
 */

function textOf(value: string | null | undefined): string | null {
  return typeof value === 'string' && value.trim() ? value : null
}

/**
 * T4-31: what to call a featured pick on App Config. The platform settings read for platform staff
 * carries `featured_labels`, each featured id mapped to its name, or to "No longer available" where
 * the record is gone. Null for an id the map does not name (and for a read without the map).
 */
export function featuredLabelOf(
  settings: Pick<components['schemas']['PlatformSettings'], 'featured_labels'> | null | undefined,
  id: string,
): string | null {
  return textOf(settings?.featured_labels?.[id])
}

/**
 * T4-34: a median response time as the server writes it ("119 days 6 hours", "Under an hour"),
 * from `response_time_median_text` on the League row and on the dashboard's analytics. When the
 * server sent no text the console's own wording (`lib/duration.ts`) is used; null when there is no
 * figure at all.
 */
export function responseTimeTextOf(
  figures:
    | Pick<components['schemas']['DashboardAnalytics'], 'response_time_median_hours' | 'response_time_median_text'>
    | Pick<components['schemas']['PerformanceLeagueRow'], 'response_time_median_hours' | 'response_time_median_text'>
    | null
    | undefined,
): string | null {
  const served = textOf(figures?.response_time_median_text)
  if (served) return served
  const hours = figures?.response_time_median_hours
  return typeof hours === 'number' ? hoursInWords(hours) : null
}
