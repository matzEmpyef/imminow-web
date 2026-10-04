import type { components } from '@/api/schema'

type AppConfig = components['schemas']['AppConfig']
export type AppConfigUpdate = components['schemas']['AppConfigUpdate']

// Plain MAJOR.MINOR.PATCH comparison — no pre-release/build metadata in this app's own version
// strings, so a numeric part-by-part compare is enough.
export function compareVersions(a: string, b: string): number {
  const pa = a.split('.').map(Number)
  const pb = b.split('.').map(Number)
  for (let i = 0; i < 3; i++) {
    const diff = (pa[i] ?? 0) - (pb[i] ?? 0)
    if (diff !== 0) return diff
  }
  return 0
}

/** True when the edit raises the minimum above what is saved — the case that needs a reason. */
export function minimumRaised(form: AppConfig, saved: AppConfig): boolean {
  return form.minimum_version !== saved.minimum_version && compareVersions(form.minimum_version, saved.minimum_version) > 0
}

/**
 * The PATCH /app-config body (gate 12c, F64): only the fields that differ from what is saved, the
 * way every other PATCH in the console works. `reason` rides along when the minimum is raised (the
 * server requires it then) or when forcing past the lock-out guard; `force` only on that re-submit.
 *
 * A blank per-platform store link clears the override (null) when one is saved; when the server
 * never sent the field (the frozen mock) a blank box means nothing and is left out.
 */
export function buildAppConfigPatch(
  form: AppConfig,
  saved: AppConfig,
  opts: { reason?: string; force?: boolean } = {},
): AppConfigUpdate {
  const patch: AppConfigUpdate = {}
  if (form.latest_version !== saved.latest_version) patch.latest_version = form.latest_version
  if (form.minimum_version !== saved.minimum_version) patch.minimum_version = form.minimum_version
  if (form.update_url.trim() !== saved.update_url) patch.update_url = form.update_url.trim()
  if (form.release_notes !== saved.release_notes) patch.release_notes = form.release_notes

  for (const key of ['update_url_android', 'update_url_ios'] as const) {
    const next = (form[key] ?? '').trim()
    const before = saved[key] ?? ''
    if (next === before) continue
    patch[key] = next || null
  }

  const rating: NonNullable<AppConfigUpdate['rating']> = {}
  for (const key of ['min_days_since_install', 'min_sessions', 'cooldown_days'] as const) {
    if (form.rating[key] !== saved.rating[key]) rating[key] = form.rating[key]
  }
  if (Object.keys(rating).length > 0) patch.rating = rating

  const reason = opts.reason?.trim()
  if (reason && (opts.force || minimumRaised(form, saved))) patch.reason = reason
  if (opts.force) patch.force = true
  return patch
}
