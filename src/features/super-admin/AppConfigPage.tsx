import { useEffect, useState } from 'react'
import { AlertTriangle } from 'lucide-react'
import { AdminShell } from '@/features/auth/AdminShell'
import { Card } from '@/components/Card'
import { Button } from '@/components/Button'
import { TextField } from '@/components/TextField'
import { Modal } from '@/components/Modal'
import { useAppConfig, useUpdateAppConfig } from '@/queries/appConfig'
import { FeaturedInstitutesCard } from './FeaturedInstitutesCard'
import type { components } from '@/api/schema'
import { showToast } from '@/lib/toast'

type AppConfig = components['schemas']['AppConfig']

const SEMVER_PATTERN = /^\d+\.\d+\.\d+$/

// Plain MAJOR.MINOR.PATCH comparison — no pre-release/build metadata in this app's own version
// strings, so a numeric part-by-part compare is enough; a real semver range parser would be
// overkill for a field that's already regex-validated to three dot-separated integers.
function compareVersions(a: string, b: string): number {
  const pa = a.split('.').map(Number)
  const pb = b.split('.').map(Number)
  for (let i = 0; i < 3; i++) {
    const diff = (pa[i] ?? 0) - (pb[i] ?? 0)
    if (diff !== 0) return diff
  }
  return 0
}

/**
 * App Config (Session 37, 2026-08-30) — the server-driven version gate + store-rating prompt
 * thresholds Sentpo Mobile fetches on every launch, before login. One form, one Save, same
 * "compact settings card" shape as Catalog Settings' Course Popularity tab.
 *
 * The page is now two independent levers (2026-09-10): this card, and the curated Top Institutes
 * rail below it. They save separately and fail separately — a version gate that will not load is
 * no reason to hide the merchandising selection, so each card owns its own loading and error
 * state rather than the page gating on both.
 */
function VersionAndRatingCard() {
  const config = useAppConfig()
  const update = useUpdateAppConfig()

  const [form, setForm] = useState<AppConfig | null>(null)
  // Any change to the version gate is irreversible-feeling enough (an app below Minimum is
  // blocked with no way to dismiss it) to need a confirmation step (review C1, 2026-09-12) — held
  // separately from `form` so cancelling the confirmation never loses the rest of an in-progress
  // edit.
  const [confirmingVersions, setConfirmingVersions] = useState(false)

  // Sync local editable state from the fetched config exactly once it arrives — a plain settings
  // form, not a per-row table, so one local copy that the Save button writes back is simpler than
  // deriving from the query on every render.
  useEffect(() => {
    if (config.data && !form) setForm(config.data)
  }, [config.data, form])

  if (config.isError) {
    return (
      <Card>
        <p className="text-body-sm text-error">Could not load the app configuration.</p>
      </Card>
    )
  }

  if (config.isLoading || !form) {
    return (
      <Card>
        <p className="text-body-sm text-text-secondary">Loading…</p>
      </Card>
    )
  }

  const versionsValid = SEMVER_PATTERN.test(form.latest_version) && SEMVER_PATTERN.test(form.minimum_version)
  const minAboveLatest = versionsValid && compareVersions(form.minimum_version, form.latest_version) > 0
  const canSave =
    versionsValid &&
    !minAboveLatest &&
    form.update_url.trim().length > 0 &&
    form.release_notes.trim().length > 0 &&
    form.rating.min_days_since_install >= 0 &&
    form.rating.min_sessions >= 0 &&
    form.rating.cooldown_days >= 0

  const minimumChanged = config.data != null && form.minimum_version !== config.data.minimum_version
  const latestChanged = config.data != null && form.latest_version !== config.data.latest_version

  function updateField<K extends keyof AppConfig>(key: K, value: AppConfig[K]) {
    setForm((prev) => (prev ? { ...prev, [key]: value } : prev))
  }

  function updateRatingField<K extends keyof AppConfig['rating']>(key: K, value: number) {
    setForm((prev) => (prev ? { ...prev, rating: { ...prev.rating, [key]: value } } : prev))
  }

  function handleSave() {
    if (!form || !canSave) return
    if (minimumChanged || latestChanged) {
      setConfirmingVersions(true)
      return
    }
    saveNow()
  }

  function saveNow() {
    if (!form) return
    update.mutate(form, {
      onSuccess: () => {
        setConfirmingVersions(false)
        showToast('App settings saved')
      },
    })
  }

  return (
    <>
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
            error={
              form.latest_version && !SEMVER_PATTERN.test(form.latest_version) ? 'Use MAJOR.MINOR.PATCH' : undefined
            }
          />
          <TextField
            label="Minimum version"
            required
            value={form.minimum_version}
            onChange={(e) => updateField('minimum_version', e.target.value)}
            placeholder="1.0.0"
            error={
              form.minimum_version && !SEMVER_PATTERN.test(form.minimum_version)
                ? 'Use MAJOR.MINOR.PATCH'
                : minAboveLatest
                  ? "Can't be above the latest version — every installed app would be blocked"
                  : undefined
            }
          />
        </div>
        <div className="flex items-start gap-sm rounded-md border border-warning bg-warning-subtle p-sm">
          <AlertTriangle className="mt-[2px] h-4 w-4 shrink-0 text-warning" />
          <p className="text-caption text-text-secondary">
            <strong className="text-text-primary">Minimum version force-blocks older apps.</strong> Any installed app
            below Minimum version is shown a full-screen &ldquo;Update required&rdquo; screen with no way to dismiss it.
            An app at or above Minimum but below Latest instead sees a one-time, dismissible &ldquo;What&rsquo;s
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
        {update.isError && !confirmingVersions && <p className="mr-auto text-body-sm text-error">{update.error.message}</p>}
        <Button onClick={handleSave} loading={update.isPending} disabled={!canSave}>
          Save
        </Button>
      </div>
    </Card>

    {confirmingVersions && config.data && (
      <Modal
        onClose={() => setConfirmingVersions(false)}
        title="Change the version gate?"
        widthRem={28}
        footer={
          <>
            {update.isError && <p className="mr-auto self-center text-body-sm text-error">{update.error.message}</p>}
            <Button variant="secondary" onClick={() => setConfirmingVersions(false)} disabled={update.isPending}>
              Cancel
            </Button>
            <Button onClick={saveNow} loading={update.isPending}>
              Change gate
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-md">
          <p className="text-body-sm text-text-secondary">
            Apps below the minimum see an &ldquo;Update required&rdquo; screen they can&rsquo;t dismiss. Apps at or
            above minimum but below latest see a one-time, dismissible &ldquo;What&rsquo;s new&rdquo; sheet instead.
          </p>
          <div className="flex flex-col gap-xs rounded-md border border-border bg-background p-sm text-body-sm">
            {minimumChanged && (
              <p className="text-text-primary">
                Minimum version: <span className="text-text-secondary">{config.data.minimum_version}</span> &rarr;{' '}
                <span className="font-medium">{form.minimum_version}</span>
              </p>
            )}
            {latestChanged && (
              <p className="text-text-primary">
                Latest version: <span className="text-text-secondary">{config.data.latest_version}</span> &rarr;{' '}
                <span className="font-medium">{form.latest_version}</span>
              </p>
            )}
          </div>
        </div>
      </Modal>
    )}
    </>
  )
}

export function AppConfigPage() {
  return (
    <AdminShell>
      <div className="flex flex-col gap-lg">
        <div>
          <h1 className="text-h1 text-text-primary">App Config</h1>
          <p className="text-body-sm text-text-secondary">
            Platform-wide levers for the Sentpo student app &mdash; the launch-time version gate and store-rating
            thresholds Sentpo Mobile fetches before login, and the institutes curated onto Home.
          </p>
        </div>

        <VersionAndRatingCard />
        <FeaturedInstitutesCard />
      </div>
    </AdminShell>
  )
}
