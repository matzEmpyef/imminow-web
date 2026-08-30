import { useEffect, useState } from 'react'
import { AlertTriangle } from 'lucide-react'
import { AdminShell } from '@/features/auth/AdminShell'
import { Card } from '@/components/Card'
import { Button } from '@/components/Button'
import { TextField } from '@/components/TextField'
import { useAppConfig, useUpdateAppConfig } from '@/queries/appConfig'
import type { components } from '@/api/schema'

type AppConfig = components['schemas']['AppConfig']

const SEMVER_PATTERN = /^\d+\.\d+\.\d+$/

/**
 * App Config (Session 37, 2026-08-30) — the server-driven version gate + store-rating prompt
 * thresholds Sentpo Mobile fetches on every launch, before login. One form, one Save, same
 * "compact settings card" shape as Catalog Settings' Course Popularity tab.
 */
export function AppConfigPage() {
  const config = useAppConfig()
  const update = useUpdateAppConfig()

  const [form, setForm] = useState<AppConfig | null>(null)

  // Sync local editable state from the fetched config exactly once it arrives — a plain settings
  // form, not a per-row table, so one local copy that the Save button writes back is simpler than
  // deriving from the query on every render.
  useEffect(() => {
    if (config.data && !form) setForm(config.data)
  }, [config.data, form])

  if (config.isLoading || !form) {
    return (
      <AdminShell>
        <div className="flex flex-col gap-lg">
          <h1 className="text-h1 text-text-primary">App Config</h1>
          <p className="text-body-sm text-text-secondary">Loading…</p>
        </div>
      </AdminShell>
    )
  }

  if (config.isError) {
    return (
      <AdminShell>
        <div className="flex flex-col gap-lg">
          <h1 className="text-h1 text-text-primary">App Config</h1>
          <p className="text-body-sm text-error">Could not load the app configuration.</p>
        </div>
      </AdminShell>
    )
  }

  const versionsValid = SEMVER_PATTERN.test(form.latest_version) && SEMVER_PATTERN.test(form.minimum_version)
  const canSave =
    versionsValid &&
    form.update_url.trim().length > 0 &&
    form.release_notes.trim().length > 0 &&
    form.rating.min_days_since_install >= 0 &&
    form.rating.min_sessions >= 0 &&
    form.rating.cooldown_days >= 0

  function updateField<K extends keyof AppConfig>(key: K, value: AppConfig[K]) {
    setForm((prev) => (prev ? { ...prev, [key]: value } : prev))
  }

  function updateRatingField<K extends keyof AppConfig['rating']>(key: K, value: number) {
    setForm((prev) => (prev ? { ...prev, rating: { ...prev.rating, [key]: value } } : prev))
  }

  function handleSave() {
    if (!form || !canSave) return
    update.mutate(form)
  }

  return (
    <AdminShell>
      <div className="flex flex-col gap-lg">
        <div>
          <h1 className="text-h1 text-text-primary">App Config</h1>
          <p className="text-body-sm text-text-secondary">
            Sentpo Mobile fetches this on every launch, before login — it drives the version gate (force-update vs. a
            dismissible &ldquo;what&rsquo;s new&rdquo; sheet) and the in-app store-rating prompt&rsquo;s thresholds.
          </p>
        </div>

        <Card className="flex flex-col gap-lg">
          <div className="flex flex-col gap-md">
            <h2 className="text-body font-medium text-text-primary">Version gate</h2>
            <div className="grid grid-cols-1 gap-md sm:grid-cols-2">
              <TextField
                label="Latest version"
                required
                value={form.latest_version}
                onChange={(e) => updateField('latest_version', e.target.value)}
                placeholder="1.0.0"
                error={form.latest_version && !SEMVER_PATTERN.test(form.latest_version) ? 'Use MAJOR.MINOR.PATCH' : undefined}
              />
              <TextField
                label="Minimum version"
                required
                value={form.minimum_version}
                onChange={(e) => updateField('minimum_version', e.target.value)}
                placeholder="1.0.0"
                error={
                  form.minimum_version && !SEMVER_PATTERN.test(form.minimum_version) ? 'Use MAJOR.MINOR.PATCH' : undefined
                }
              />
            </div>
            <div className="flex items-start gap-sm rounded-md border border-warning bg-warning-subtle p-sm">
              <AlertTriangle className="mt-[2px] h-4 w-4 shrink-0 text-warning" />
              <p className="text-caption text-text-secondary">
                <strong className="text-text-primary">Minimum version force-blocks older apps.</strong> Any installed app
                below Minimum version is shown a full-screen &ldquo;Update required&rdquo; screen with no way to dismiss
                it. An app at or above Minimum but below Latest instead sees a one-time, dismissible &ldquo;What&rsquo;s
                new&rdquo; sheet.
              </p>
            </div>
            <TextField
              label="Update URL"
              required
              value={form.update_url}
              onChange={(e) => updateField('update_url', e.target.value)}
              placeholder="https://play.google.com/store/apps/details?id=com.sentpo.app"
            />
            <div className="flex flex-col gap-xs">
              <label className="text-body-sm font-medium text-text-primary" htmlFor="release-notes">
                Release notes<span className="text-error"> *</span>
              </label>
              <textarea
                id="release-notes"
                value={form.release_notes}
                onChange={(e) => updateField('release_notes', e.target.value)}
                rows={3}
                className="w-full rounded-md border border-border bg-surface p-sm text-body outline-none focus:border-2 focus:border-primary"
                placeholder="Shown on both the update screen and the what's new sheet."
              />
            </div>
          </div>

          <div className="flex flex-col gap-md border-t border-border pt-lg">
            <div>
              <h2 className="text-body font-medium text-text-primary">Store-rating prompt</h2>
              <p className="text-body-sm text-text-secondary">
                Every threshold below must pass before the app asks a student to rate it — all evaluated locally on the
                device, using its own first-run timestamp and locally-counted session starts.
              </p>
            </div>
            <div className="grid grid-cols-1 gap-md sm:grid-cols-3">
              <TextField
                label="Min. days since install"
                type="number"
                min={0}
                required
                value={String(form.rating.min_days_since_install)}
                onChange={(e) => updateRatingField('min_days_since_install', Math.max(0, Number(e.target.value) || 0))}
              />
              <TextField
                label="Min. sessions"
                type="number"
                min={0}
                required
                value={String(form.rating.min_sessions)}
                onChange={(e) => updateRatingField('min_sessions', Math.max(0, Number(e.target.value) || 0))}
              />
              <TextField
                label="Cooldown (days)"
                type="number"
                min={0}
                required
                value={String(form.rating.cooldown_days)}
                onChange={(e) => updateRatingField('cooldown_days', Math.max(0, Number(e.target.value) || 0))}
              />
            </div>
          </div>

          <div className="flex items-center justify-end gap-md border-t border-border pt-lg">
            {update.isError && <p className="mr-auto text-body-sm text-error">{update.error.message}</p>}
            {update.isSuccess && !update.isPending && (
              <p className="mr-auto text-body-sm text-success">Saved.</p>
            )}
            <Button onClick={handleSave} loading={update.isPending} disabled={!canSave}>
              Save
            </Button>
          </div>
        </Card>
      </div>
    </AdminShell>
  )
}
