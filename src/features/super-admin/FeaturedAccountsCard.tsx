import { useEffect, useState, type ReactNode } from 'react'
import { ArrowDown, ArrowUp, X } from 'lucide-react'
import { Card } from '@/components/Card'
import { Button } from '@/components/Button'
import { SearchSelect } from '@/components/SearchSelect'
import { useAdminConsultancies } from '@/queries/adminConsultancies'
import { usePlatformSettings, useUpdatePlatformSettings } from '@/queries/catalogSettings'
import { showToast } from '@/lib/toast'

// Matches the server's own `MAX_FEATURED_INSTITUTES` / `MAX_FEATURED_CONSULTANCIES`, and the
// three cards each rail shows on Home. There is no shared-package boundary between the mock
// server and this client, so the two are kept in step by hand — the server refuses a fourth
// outright, so this cap is a courtesy rather than the enforcement.
const MAX_FEATURED = 3

type SettingKey = 'featured_institutes' | 'featured_consultancies'

/**
 * One hand-picked, ordered rail on Sentpo Home — the shared body behind both
 * {@link FeaturedInstitutesCard} and {@link FeaturedConsultanciesCard}.
 *
 * It lives on App Config rather than in Manage Consultancies because it is a merchandising
 * decision about the student app, not a property of any one account — the same reason it is a
 * platform setting server-side rather than a field on a consultancy row.
 *
 * ORDER IS THE CONTENT. The ordinary rails are algorithmic (`sort=-rating`, narrowed by the
 * student's own target countries); these are hand-picked, and the sequence chosen here is exactly
 * the sequence students see — the endpoint serving it ignores `sort` for precisely that reason.
 * So the control is a reorderable list, not a set of checkboxes.
 *
 * EMPTY IS THE NORMAL STATE, not an error. The copy each caller passes says what happens then, so
 * an admin who finds nothing selected knows they are looking at the default rather than a broken
 * screen.
 *
 * Generalised from the institutes-only original when Featured consultancies joined it
 * (assumptions audit, Featured consultancies item, approved 2026-09-19) — one control, two
 * settings, rather than a second copy of the same 150 lines drifting away from the first.
 */
function FeaturedAccountsCard({
  settingKey,
  kind,
  heading,
  intro,
  emptyState,
  noneExist,
  addLabel,
  addPlaceholder,
  savedToast,
}: {
  settingKey: SettingKey
  kind: 'consultancy' | 'institute'
  heading: string
  intro: ReactNode
  /** Shown in place of the list when nothing is picked — says what the app does with none. */
  emptyState: string
  /** Shown when there is no account of this kind to pick at all. */
  noneExist: string
  addLabel: string
  addPlaceholder: string
  savedToast: string
}) {
  const settings = usePlatformSettings()
  const update = useUpdatePlatformSettings()
  // Every account of this kind, not a page of them — the picker is a choice among a manageable
  // list, and `kind` is the server-side filter D10 added to this same list endpoint.
  const accounts = useAdminConsultancies({ kind, limit: 100 })

  const [selected, setSelected] = useState<string[] | null>(null)

  // Same "sync once on arrival" shape as the version-gate form on this page: one local copy the
  // Save button writes back, rather than deriving from the query on every render.
  useEffect(() => {
    if (settings.data && selected === null) setSelected(settings.data[settingKey] ?? [])
  }, [settings.data, selected, settingKey])

  const saved = settings.data?.[settingKey] ?? []
  const current = selected ?? saved
  const byId = new Map((accounts.data?.items ?? []).map((c) => [c.id!, c]))
  const options = (accounts.data?.items ?? [])
    .filter((c) => !current.includes(c.id!))
    .map((c) => ({ id: c.id!, label: c.name!, sublabel: c.city ?? undefined }))

  const dirty = JSON.stringify(current) !== JSON.stringify(saved)
  const atCap = current.length >= MAX_FEATURED
  const noneAvailable = (accounts.data?.items ?? []).length === 0

  function move(index: number, delta: number) {
    const target = index + delta
    if (target < 0 || target >= current.length) return
    const next = [...current]
    const held = next[index]
    next[index] = next[target]
    next[target] = held
    setSelected(next)
  }

  function label(id: string) {
    return byId.get(id)?.name ?? id
  }

  return (
    <Card className="flex flex-col gap-md">
      <div>
        <h2 className="text-body font-medium text-text-primary">{heading}</h2>
        <p className="text-body-sm text-text-secondary">{intro}</p>
      </div>

      {settings.isError || accounts.isError ? (
        <p className="text-body-sm text-error">Could not load the featured selection.</p>
      ) : settings.isLoading || accounts.isLoading ? (
        <p className="text-body-sm text-text-secondary">Loading…</p>
      ) : (
        <>
          {current.length === 0 ? (
            <p className="rounded-md border border-dashed border-border p-md text-body-sm text-text-secondary">
              {emptyState}
            </p>
          ) : (
            <ol className="flex flex-col rounded-md border border-border">
              {current.map((id, index) => (
                <li key={id} className="flex items-center gap-sm border-b border-border px-sm py-sm last:border-b-0">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-caption font-medium text-primary">
                    {index + 1}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-body-sm text-text-primary">{label(id)}</span>
                  <button
                    type="button"
                    aria-label={`Move ${label(id)} up`}
                    disabled={index === 0}
                    onClick={() => move(index, -1)}
                    className="flex h-8 w-8 items-center justify-center rounded-md text-text-secondary hover:bg-background hover:text-text-primary disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    <ArrowUp className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    aria-label={`Move ${label(id)} down`}
                    disabled={index === current.length - 1}
                    onClick={() => move(index, 1)}
                    className="flex h-8 w-8 items-center justify-center rounded-md text-text-secondary hover:bg-background hover:text-text-primary disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    <ArrowDown className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    aria-label={`Remove ${label(id)}`}
                    onClick={() => setSelected(current.filter((x) => x !== id))}
                    className="flex h-8 w-8 items-center justify-center rounded-md text-text-secondary hover:bg-background hover:text-error"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </li>
              ))}
            </ol>
          )}

          {noneAvailable ? (
            <p className="text-caption text-text-secondary">{noneExist}</p>
          ) : atCap ? (
            <p className="text-caption text-text-secondary">
              {MAX_FEATURED} is the maximum — remove one to swap it in. The server refuses a fourth outright, so this
              is not a soft limit.
            </p>
          ) : (
            <div className="max-w-[24rem]">
              <SearchSelect
                id={`${settingKey}-add`}
                label={addLabel}
                options={options}
                value=""
                onChange={(id) => id && setSelected([...current, id])}
                placeholder={addPlaceholder}
              />
            </div>
          )}

          <div className="flex items-center justify-end gap-md border-t border-border pt-md">
            {update.isError && <p className="mr-auto text-body-sm text-error">{update.error.message}</p>}
            <Button variant="secondary" disabled={!dirty || update.isPending} onClick={() => setSelected([...saved])}>
              Discard
            </Button>
            <Button
              disabled={!dirty}
              loading={update.isPending}
              onClick={() => update.mutate({ [settingKey]: current }, { onSuccess: () => showToast(savedToast) })}
            >
              Save
            </Button>
          </div>
        </>
      )}
    </Card>
  )
}

/** Top Institutes on Sentpo Home (INSTITUTE_ACCOUNT_PLAN D15, 2026-09-10). */
export function FeaturedInstitutesCard() {
  return (
    <FeaturedAccountsCard
      settingKey="featured_institutes"
      kind="institute"
      heading="Featured institutes — Sentpo Home"
      intro={
        <>
          Up to {MAX_FEATURED}, in the order students see them. This rail is hand-picked, unlike Top Consultancies,
          which is ranked by rating against the student&rsquo;s own target countries. Pick none and the section is
          hidden altogether &mdash; that is the default, not a fault.
        </>
      }
      emptyState="Nothing featured. The Top Institutes section is hidden on Sentpo Home."
      noneExist="No institute accounts exist yet — create one from Manage Consultancies before featuring it."
      addLabel="Add an institute"
      addPlaceholder="Search institutes…"
      savedToast="Featured institutes saved"
    />
  )
}

/**
 * Featured consultancies on Home (approved 2026-09-19 — "home page is prime real estate, the top
 * 3 should be the platform admin's choice"). Unlike the institutes rail, this one never hides when
 * it is empty: the app falls back to the ordinary ranking for every slot nobody has picked, so the
 * copy here says that rather than implying the section disappears.
 */
export function FeaturedConsultanciesCard() {
  return (
    <FeaturedAccountsCard
      settingKey="featured_consultancies"
      kind="consultancy"
      heading="Featured consultancies on Home"
      intro={
        <>
          Up to {MAX_FEATURED}, in the order students see them. The app labels these &ldquo;Featured&rdquo; and fills
          any slot you leave empty with the ordinary ranking, so the section always appears.
        </>
      }
      emptyState="Nothing featured. Home shows the ordinary ranking — rating, then response time."
      noneExist="No consultancy accounts exist yet."
      addLabel="Add a consultancy"
      addPlaceholder="Search consultancies…"
      savedToast="Featured consultancies saved"
    />
  )
}
