import { useEffect, useState } from 'react'
import { SelectField } from '@/components/SelectField'
import { Settings } from 'lucide-react'
import { AdminShell } from '@/features/auth/AdminShell'
import { Button } from '@/components/Button'
import { CreateConsultancyModal } from './CreateConsultancyModal'
import { Badge } from '@/components/Badge'
import { Card } from '@/components/Card'
import { TextField } from '@/components/TextField'
import { Toggle } from '@/components/Toggle'
import { Modal } from '@/components/Modal'
import { Table, type TableColumn } from '@/components/Table'
import { CompactSelect } from '@/components/CompactSelect'
import { PartnerCollegesPanel } from '@/features/administration/PartnerCollegesPanel'
import {
  useAdminConsultancies,
  useChangeTier,
  useReactivateConsultancy,
  useSuspendConsultancy,
  useSetConsultancyRating,
  useUpdateEntitlements,
  useTierImpact,
} from '@/queries/adminConsultancies'
import { useCursorPagination } from '@/lib/pagination'
import { useConsultancyKyc, useVerifyKyc } from '@/queries/kyc'
import type { components } from '@/api/schema'
import { BUSINESS_FEATURES, ULTIMATE_FEATURES, STARTER_CORE_FEATURES, TIER_ORDER, type FeatureDef } from '@/lib/features'

type Consultancy = components['schemas']['Consultancy']

// The effective (preset ⊕ override) state a toggle should show for `flag` at the PENDING
// (possibly not-yet-saved) `tier` selection — mirrors the server's own `effectiveEntitlements`
// exactly, just computed client-side against local edit state instead of the saved record.
function presetOn(tier: string | undefined, flag: FeatureDef) {
  return TIER_ORDER.indexOf((tier ?? 'starter') as (typeof TIER_ORDER)[number]) >= TIER_ORDER.indexOf(flag.tier)
}

function FeatureToggleRow({
  flag,
  tier,
  overrides,
  onToggle,
  onReset,
}: {
  flag: FeatureDef
  tier: string | undefined
  overrides: Record<string, boolean>
  onToggle: (key: string, nextValue: boolean) => void
  onReset: (key: string) => void
}) {
  const preset = presetOn(tier, flag)
  const isOverridden = flag.key in overrides
  const effective = isOverridden ? overrides[flag.key] : preset
  return (
    <div className="flex items-center justify-between gap-sm">
      <div className="min-w-0">
        <p className="text-body-sm text-text-primary">{flag.label}</p>
        <p className="truncate text-caption text-text-secondary" title={flag.description}>
          {flag.description}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-sm">
        {isOverridden && (
          <button
            type="button"
            onClick={() => onReset(flag.key)}
            className="text-caption text-text-secondary underline hover:text-text-primary"
          >
            Reset
          </button>
        )}
        <Toggle checked={effective} onChange={() => onToggle(flag.key, !effective)} label={flag.label} />
      </div>
    </div>
  )
}

// Rating, in the Manage popup.
//
// The rating a student sees is COMPUTED from real submissions — every Stage 1 star rating plus
// every Verified Review. Until 2026-08-23 it was a static seed number that nothing could move,
// which is why this control exists at all. The override is for the two cases the computation can't
// serve: a brand-new agency nobody has rated yet, and a rating that is demonstrably unfair. It is
// always reversible — "Use computed rating" clears it and the live average takes over again.
//
// The computed value and the count stay visible WHILE an override is in force, deliberately: an
// admin overriding 2.1 to 4.5 should have to look at the 2.1 while doing it.
function RatingSection({ consultancy }: { consultancy: Consultancy }) {
  const setRating = useSetConsultancyRating(consultancy.id!)
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState('')
  const [reason, setReason] = useState('')

  const count = consultancy.rating_count ?? 0
  const isOverridden = consultancy.rating_source === 'override'
  const computedLabel =
    consultancy.rating_computed != null
      ? `${consultancy.rating_computed.toFixed(1)} from ${count} ${count === 1 ? 'rating' : 'ratings'}`
      : 'No ratings submitted yet'

  const parsed = Number(value)
  const valid = value.trim() !== '' && !Number.isNaN(parsed) && parsed >= 1 && parsed <= 5

  return (
    <div className="flex flex-col gap-sm">
      <div className="flex items-center justify-between">
        <div className="flex flex-col">
          <p className="text-body-sm font-medium text-text-primary">Rating</p>
          <p className="text-body-sm text-text-secondary">
            {consultancy.rating != null ? consultancy.rating.toFixed(1) : 'Not rated yet'}
            {isOverridden ? (
              <span className="ml-2 rounded-sm bg-warning/15 px-1.5 py-0.5 text-caption text-text-primary">
                Set by admin
              </span>
            ) : null}
          </p>
          <p className="text-caption text-text-secondary">Computed: {computedLabel}</p>
        </div>
        {editing ? null : (
          <div className="flex gap-xs">
            {isOverridden && (
              <Button
                variant="secondary"
                loading={setRating.isPending}
                onClick={() => setRating.mutate({ rating: null })}
              >
                Use computed
              </Button>
            )}
            <Button
              variant="secondary"
              onClick={() => {
                setValue(consultancy.rating != null ? String(consultancy.rating) : '')
                setReason('')
                setEditing(true)
              }}
            >
              {isOverridden ? 'Change' : 'Override'}
            </Button>
          </div>
        )}
      </div>
      {editing && (
        <div className="flex flex-col gap-sm rounded-md border border-border p-md">
          <div className="flex gap-sm">
            <TextField
              label="Rating"
              type="number"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              className="w-32"
            />
            <TextField label="Reason" value={reason} onChange={(e) => setReason(e.target.value)} className="flex-1" />
          </div>
          <p className="text-caption text-text-secondary">
            1 to 5, one decimal. The reason is recorded in the audit log. Students see this number instead of the
            computed one until the override is removed.
          </p>
          <div className="flex justify-end gap-xs">
            <Button variant="secondary" onClick={() => setEditing(false)}>
              Cancel
            </Button>
            <Button
              disabled={!valid}
              loading={setRating.isPending}
              onClick={() => setRating.mutate({ rating: parsed, reason }, { onSuccess: () => setEditing(false) })}
            >
              Save rating
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}

// User-requested (2026-08-18) — "Suspend in first line (confirm, as user to type delete or
// something before suspention)". A typed confirmation, not just a click-through confirm popup,
// since suspending blocks every one of this consultancy's own staff from working until reversed —
// a heavier bar than the platform's usual single-click "Delete"-style confirm.
function SuspendConfirmModal({
  consultancyName,
  onConfirm,
  onClose,
  loading,
}: {
  consultancyName: string
  onConfirm: () => void
  onClose: () => void
  loading: boolean
}) {
  const [confirmText, setConfirmText] = useState('')
  return (
    <Modal
      onClose={onClose}
      title="Suspend Consultancy"
      widthRem={26}
      footer={
        <Button variant="destructive" loading={loading} disabled={confirmText !== 'SUSPEND'} onClick={onConfirm}>
          Suspend
        </Button>
      }
    >
      <div className="flex flex-col gap-md">
        <p className="text-body-sm text-text-secondary">
          This marks <span className="font-medium text-text-primary">{consultancyName}</span> as suspended until
          reactivated. Type <span className="font-mono font-medium text-text-primary">SUSPEND</span> to confirm.
        </p>
        <TextField
          label="Confirmation"
          value={confirmText}
          onChange={(e) => setConfirmText(e.target.value.toUpperCase())}
          placeholder="SUSPEND"
        />
      </div>
    </Modal>
  )
}

// Restructured (user-requested, 2026-08-18 — "align items more properly.. Suspend in first line
// ... next line plan change ... Feature & limits text boxes in one line .. we need only one save
// button in the popup"): Suspend/Reactivate is its own first row (Suspend gated behind the typed
// confirm above), Plan is its own row with no separate Change Plan button, Seat limit/File number
// prefix sit side by side, and a single Save Changes button now covers both the plan change and
// Features & Limits — Change Plan previously fired its own PATCH the moment it was clicked, Save
// Features & Limits a separate one; now everything in the popup other than Suspend/Reactivate
// (kept separate deliberately — it's a distinct, irreversible-until-reversed action with its own
// confirm flow, not a form field) saves together.
/**
 * KYC review inside Manage (2026-08-19) — the other half of the consultancy's certificate
 * upload. Verify is enabled only when a document exists (the server 400s otherwise too — a
 * badge is never granted sight unseen), and the submitted certificate opens in a new tab for
 * actual review before approving.
 */
function KycSection({ consultancyId, kycVerified }: { consultancyId: string; kycVerified: boolean }) {
  const kyc = useConsultancyKyc(consultancyId)
  const verify = useVerifyKyc()
  const status = kyc.data?.status ?? (kycVerified ? 'verified' : 'not_submitted')

  return (
    <div className="flex flex-col gap-xs rounded-md border border-border p-md">
      <div className="flex items-center justify-between">
        <p className="text-body-sm font-medium text-text-primary">KYC</p>
        <Badge
          color={status === 'verified' ? 'success' : status === 'pending' ? 'warning' : 'secondary'}
          className="capitalize"
        >
          {status.replace(/_/g, ' ')}
        </Badge>
      </div>
      {kyc.data?.document_url ? (
        <a
          href={kyc.data.document_url}
          target="_blank"
          rel="noreferrer"
          className="w-fit text-body-sm text-primary underline"
        >
          View submitted certificate
        </a>
      ) : (
        <p className="text-caption text-text-secondary">No certificate submitted yet.</p>
      )}
      {status === 'pending' && (
        <Button
          className="w-fit"
          variant="secondary"
          loading={verify.isPending}
          onClick={() => verify.mutate(consultancyId)}
        >
          Verify certificate
        </Button>
      )}
      {verify.isError && <p className="text-caption text-error">{verify.error.message}</p>}
    </div>
  )
}

function ConsultancyDetail({ consultancy, onClose }: { consultancy: Consultancy; onClose: () => void }) {
  const changeTier = useChangeTier(consultancy.id!)
  const updateEntitlements = useUpdateEntitlements(consultancy.id!)
  const suspend = useSuspendConsultancy(consultancy.id!)
  const reactivate = useReactivateConsultancy(consultancy.id!)

  const [tier, setTier] = useState(consultancy.tier)
  const [seatLimit, setSeatLimit] = useState(consultancy.seat_limit)
  const [overrides, setOverrides] = useState<Record<string, boolean>>(consultancy.entitlement_overrides ?? {})
  const [filePrefix, setFilePrefix] = useState(consultancy.file_number_prefix ?? '')
  const [freelancerEnabled, setFreelancerEnabled] = useState(Boolean(consultancy.freelancer_enabled))
  const [confirmingSuspend, setConfirmingSuspend] = useState(false)
  const [showPartnerColleges, setShowPartnerColleges] = useState(false)

  useEffect(() => {
    setTier(consultancy.tier)
    setSeatLimit(consultancy.seat_limit)
    setOverrides(consultancy.entitlement_overrides ?? {})
    setFilePrefix(consultancy.file_number_prefix ?? '')
    setFreelancerEnabled(Boolean(consultancy.freelancer_enabled))
  }, [consultancy])

  function toggleFlag(key: string, nextValue: boolean) {
    setOverrides((prev) => ({ ...prev, [key]: nextValue }))
  }

  function resetFlag(key: string) {
    setOverrides((prev) => {
      const next = { ...prev }
      delete next[key]
      return next
    })
  }

  // Plan change re-baselines the panel (build reference 1.16 made real, 2026-08-29) — mirrors
  // the server's own PATCH /tier, which resets entitlement_overrides to null on every tier
  // change. Clearing here too (rather than only on save) means the toggles the admin sees while
  // still deciding already reflect the plan they're about to switch to, not stale overrides from
  // the one they're leaving.
  function handleTierChange(nextTier: Consultancy['tier']) {
    setTier(nextTier)
    setOverrides({})
  }

  // Only a DOWNGRADE has consequences worth warning about — moving up never disables anything.
  const isDowngrade =
    tier !== consultancy.tier && TIER_ORDER.indexOf(tier ?? '') < TIER_ORDER.indexOf(consultancy.tier ?? '')
  const impact = useTierImpact(consultancy.id!, tier, isDowngrade)

  const hasChanges =
    tier !== consultancy.tier ||
    seatLimit !== consultancy.seat_limit ||
    filePrefix !== (consultancy.file_number_prefix ?? '') ||
    freelancerEnabled !== Boolean(consultancy.freelancer_enabled) ||
    JSON.stringify(overrides) !== JSON.stringify(consultancy.entitlement_overrides ?? {})
  const saving = changeTier.isPending || updateEntitlements.isPending
  const saveError = changeTier.error ?? updateEntitlements.error

  async function handleSave() {
    try {
      const tierChanged = tier !== consultancy.tier
      if (tierChanged) await changeTier.mutateAsync(tier!)
      // Double-PATCH fix (UAT sweep M5, 2026-08-29): PATCH /tier already performs the clean
      // preset re-baseline (seat limit + overrides reset). Re-sending the modal's PRE-change
      // seat/override values right after silently undid that reset — the form was showing the
      // OLD tier's numbers. After a tier change, only the fields the tier reset does not touch
      // ride along (freelancer channel, file prefix); seat/override tweaks for the NEW tier are
      // a second, deliberate edit once the modal reflects the new baseline.
      const entitlementsBody = tierChanged
        ? {
            freelancer_enabled: freelancerEnabled,
            ...(consultancy.file_number_locked ? {} : { file_number_prefix: filePrefix }),
          }
        : {
            seat_limit: seatLimit,
            entitlement_overrides: overrides,
            freelancer_enabled: freelancerEnabled,
            ...(consultancy.file_number_locked ? {} : { file_number_prefix: filePrefix }),
          }
      await updateEntitlements.mutateAsync(entitlementsBody)
    } catch {
      // surfaced via changeTier.error / updateEntitlements.error below
    }
  }

  return (
    <Modal
      onClose={onClose}
      title={`Manage ${consultancy.name}`}
      widthRem={34}
      footer={
        <>
          {saveError && <p className="mr-auto self-center text-body-sm text-error">{saveError.message}</p>}
          <Button loading={saving} disabled={!hasChanges} onClick={handleSave}>
            Save Changes
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-lg">
        <div className="flex items-center justify-between">
          <p className="text-body-sm font-medium text-text-primary">Partner Colleges</p>
          {/* Configure-on-behalf (plan §1.7 — "editable by the consultancy admin AND by
              platform admin on behalf") — same shared panel the consultancy's own tab uses. */}
          <Button variant="secondary" onClick={() => setShowPartnerColleges(true)}>
            Configure
          </Button>
        </div>
        <div className="flex items-center justify-between">
          <p className="text-body-sm font-medium text-text-primary">Status</p>
          {consultancy.active ? (
            <Button variant="destructive" onClick={() => setConfirmingSuspend(true)}>
              Suspend
            </Button>
          ) : (
            <Button variant="secondary" loading={reactivate.isPending} onClick={() => reactivate.mutate()}>
              Reactivate
            </Button>
          )}
        </div>
        <RatingSection consultancy={consultancy} />
        {confirmingSuspend && (
          <SuspendConfirmModal
            consultancyName={consultancy.name ?? ''}
            loading={suspend.isPending}
            onClose={() => setConfirmingSuspend(false)}
            onConfirm={() => suspend.mutate(undefined, { onSuccess: () => setConfirmingSuspend(false) })}
          />
        )}

        {showPartnerColleges && (
          <Modal
            title={`Partner Colleges — ${consultancy.name}`}
            widthRem={50}
            onClose={() => setShowPartnerColleges(false)}
          >
            <PartnerCollegesPanel consultancyId={consultancy.id!} />
          </Modal>
        )}

        <KycSection consultancyId={consultancy.id!} kycVerified={Boolean(consultancy.kyc_verified)} />

        <SelectField
          label="Plan"
          required
          id={`tier-${consultancy.id}`}
          value={tier}
          onChange={(e) => handleTierChange(e.target.value as Consultancy['tier'])}
        >
          <option value="starter">Starter</option>
          <option value="business">Business</option>
          <option value="ultimate">Ultimate</option>
        </SelectField>

        {/* Advisory, never blocking (user, 2026-08-23): "tell super admin that these things are
            over limit (in case the admin wants to resolve it first), but still let super admin to
            disable silently." Save stays enabled throughout. */}
        {isDowngrade &&
        impact.data &&
        (impact.data.employees_to_disable?.length || impact.data.branches_to_deactivate?.length) ? (
          <div className="rounded-md border border-warning bg-warning/10 p-md">
            <p className="text-body-sm font-medium text-text-primary">Downgrading to {tier} will disable things</p>
            {impact.data.employees_to_disable?.length ? (
              <p className="mt-xs text-body-sm text-text-secondary">
                <span className="font-medium text-text-primary">
                  {impact.data.employees_to_disable.length} employee
                  {impact.data.employees_to_disable.length === 1 ? '' : 's'}
                </span>{' '}
                past the {impact.data.seat_limit}-seat cap will be disabled (newest first):{' '}
                {impact.data.employees_to_disable.map((e) => e.name).join(', ')}.
                {impact.data.work_to_reassign ? (
                  <>
                    {' '}
                    Their {impact.data.work_to_reassign} lead
                    {impact.data.work_to_reassign === 1 ? '' : 's'}/client
                    {impact.data.work_to_reassign === 1 ? '' : 's'} will move to{' '}
                    {impact.data.reassign_to?.name ?? 'the primary consultant'}.
                  </>
                ) : null}
              </p>
            ) : null}
            {impact.data.branches_to_deactivate?.length ? (
              <p className="mt-xs text-body-sm text-text-secondary">
                {tier === 'ultimate' ? '' : 'This tier allows one branch, so '}
                {impact.data.branches_to_deactivate.map((b) => b.name).join(', ')} will be deactivated.
              </p>
            ) : null}
            <p className="mt-sm text-caption text-text-secondary">
              Nothing is deleted — accounts and branches keep their data and can be re-enabled by upgrading again. You
              can also fix this yourself first and come back.
            </p>
          </div>
        ) : null}

        <div className="flex flex-col gap-md">
          <p className="text-body-sm font-medium text-text-primary">Features & Limits</p>
          <div className="flex gap-md">
            <TextField
              label="Seat limit"
              type="number"
              value={seatLimit}
              onChange={(e) => setSeatLimit(Number(e.target.value))}
              className="flex-1"
            />
            <div className="flex flex-1 flex-col gap-xs">
              <TextField
                label="File number prefix"
                value={filePrefix}
                onChange={(e) =>
                  setFilePrefix(
                    e.target.value
                      .toUpperCase()
                      .replace(/[^A-Z]/g, '')
                      .slice(0, 3),
                  )
                }
                maxLength={3}
                disabled={consultancy.file_number_locked}
                className="w-full uppercase"
              />
            </div>
          </div>
          <p className="text-caption text-text-secondary">
            {consultancy.file_number_locked
              ? 'File number prefix locked — this consultancy already has clients using it.'
              : 'Prefixes every client file number this consultancy generates, e.g. "' +
                (filePrefix || '···') +
                '0000001".'}
          </p>
          <div className="flex flex-col gap-xs rounded-md border border-border bg-background p-sm">
            <p className="text-caption font-medium text-text-secondary">Included in every plan</p>
            <p className="text-caption text-text-secondary">{STARTER_CORE_FEATURES.join(' · ')}</p>
          </div>

          {Object.keys(overrides).length > 0 && (
            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => setOverrides({})}
                className="text-caption text-text-secondary underline hover:text-text-primary"
              >
                Reset all to plan defaults
              </button>
            </div>
          )}

          <div className="flex flex-col gap-sm">
            <p className="text-caption font-medium text-text-secondary">Business plan features</p>
            <div className="flex flex-col gap-sm">
              {BUSINESS_FEATURES.map((flag) => (
                <FeatureToggleRow
                  key={flag.key}
                  flag={flag}
                  tier={tier}
                  overrides={overrides}
                  onToggle={toggleFlag}
                  onReset={resetFlag}
                />
              ))}
            </div>
          </div>

          <div className="flex flex-col gap-sm">
            <p className="text-caption font-medium text-text-secondary">Ultimate plan features</p>
            <div className="flex flex-col gap-sm">
              {ULTIMATE_FEATURES.map((flag) => (
                <FeatureToggleRow
                  key={flag.key}
                  flag={flag}
                  tier={tier}
                  overrides={overrides}
                  onToggle={toggleFlag}
                  onReset={resetFlag}
                />
              ))}
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-xs border-t border-border pt-md">
          {/* User-requested (2026-08-19) — "at consultancy level we want to enable or disable
              Freelancer to a consultancy. if enabled on freelancer rates applicable... if enabled
              then only applicant allocation from freelancer possible." A distinct row from the
              generic feature registry above, not folded into FEATURE_REGISTRY/entitlement_overrides,
              since this one has real gating logic behind it (Commission Rates, Applicant
              Allocation), not just a plan-tier flag. */}
          <div className="flex items-center justify-between">
            <div>
              <p className="text-body-sm font-medium text-text-primary">Freelancer channel</p>
              <p className="text-caption text-text-secondary">
                Enables this consultancy's freelancer-sourced commission rate and lets Applicant Allocation offer it as
                a target for freelancer-sourced aspirants.
              </p>
            </div>
            <Toggle checked={freelancerEnabled} onChange={setFreelancerEnabled} label="Freelancer channel" />
          </div>
        </div>
      </div>
    </Modal>
  )
}

export function ManageConsultanciesPage() {
  const [search, setSearch] = useState('')
  const [tierFilter, setTierFilter] = useState('')
  const [sort, setSort] = useState<{ field: string; direction: 'asc' | 'desc' } | null>(null)
  const [managingId, setManagingId] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const paging = useCursorPagination()

  const consultancies = useAdminConsultancies({
    search: search || undefined,
    tier: (tierFilter || undefined) as 'starter' | 'business' | 'ultimate' | undefined,
    sort: sort ? (sort.direction === 'desc' ? `-${sort.field}` : sort.field) : undefined,
    cursor: paging.cursor,
    limit: 20,
  })

  const managingConsultancy = managingId ? consultancies.data?.items.find((c) => c.id === managingId) : undefined
  const tierCounts = consultancies.data?.tier_counts
  const totalCount = tierCounts ? tierCounts.starter + tierCounts.business + tierCounts.ultimate : undefined

  function resetPaging() {
    paging.reset()
  }

  const columns: TableColumn<Consultancy>[] = [
    {
      key: 'name',
      header: 'Name',
      sortable: true,
      render: (c) => <span className="font-medium text-text-primary">{c.name}</span>,
    },
    {
      key: 'tier',
      header: 'Plan',
      sortable: true,
      render: (c) => (
        <Badge color="primary" className="capitalize">
          {c.tier}
        </Badge>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (c) => (
        <div className="flex items-center gap-xs">
          <Badge color={c.active ? 'success' : 'secondary'}>{c.active ? 'Active' : 'Suspended'}</Badge>
          {!c.kyc_verified && <Badge color="warning">KYC pending</Badge>}
        </div>
      ),
    },
    { key: 'city', header: 'City', sortable: true, render: (c) => c.city },
    {
      // Sortable, so "which agencies are rated worst" is one click. The count sits next to the
      // number because a lone 4.6 does not say whether one student or a thousand produced it.
      key: 'rating',
      header: 'Rating',
      sortable: true,
      render: (c) =>
        c.rating == null ? (
          <span className="text-text-secondary">Not rated</span>
        ) : (
          <span className="flex items-center gap-xs">
            <span className="font-medium text-text-primary">{c.rating.toFixed(1)}</span>
            {/* The count is about the COMPUTED average, so it is meaningless beside an
                admin-set number — an override with no real ratings rendered "4.5 (0)", which
                reads as "4.5 from nobody". The badge already says where the number came from. */}
            {c.rating_source !== 'override' && (c.rating_count ?? 0) > 0 && (
              <span className="text-caption text-text-secondary">({c.rating_count})</span>
            )}
            {c.rating_source === 'override' && <Badge color="warning">Set by admin</Badge>}
          </span>
        ),
    },
    { key: 'seat_limit', header: 'Seats', sortable: true, align: 'right', render: (c) => c.seat_limit },
    {
      key: 'actions',
      header: '',
      align: 'right',
      render: (c) => (
        <div className="flex justify-end">
          <button
            type="button"
            onClick={() => setManagingId(c.id!)}
            aria-label={`Manage ${c.name}`}
            title="Manage"
            className="flex h-9 w-9 items-center justify-center rounded-md text-text-secondary hover:bg-background hover:text-text-primary"
          >
            <Settings className="h-4 w-4" />
          </button>
        </div>
      ),
    },
  ]

  return (
    <AdminShell>
      <div className="flex flex-col gap-lg">
        <div className="flex items-start justify-between gap-md">
          <h1 className="text-h1 text-text-primary">Manage Consultancies</h1>
          <Button onClick={() => setCreating(true)}>Create Consultancy</Button>
        </div>

        {creating && <CreateConsultancyModal onClose={() => setCreating(false)} />}

        {/* KPI cards (user-requested, 2026-08-18 — "have KPIs.. how much count in each tier")
            — always the platform-wide tier breakdown from `tier_counts`, independent of this
            page's own search/plan filter, so the totals don't shift as an admin filters the list
            below. Moved here from the Dashboard, which now shows only the total. */}
        <div className="grid grid-cols-2 gap-md md:grid-cols-4">
          <Card>
            <p className="text-caption text-text-secondary">Total Consultancies</p>
            <p className="mt-xs text-h1 text-text-primary">{totalCount ?? '…'}</p>
          </Card>
          <Card>
            <p className="text-caption text-text-secondary">Starter</p>
            <p className="mt-xs text-h1 text-text-primary">{tierCounts?.starter ?? '…'}</p>
          </Card>
          <Card>
            <p className="text-caption text-text-secondary">Business</p>
            <p className="mt-xs text-h1 text-text-primary">{tierCounts?.business ?? '…'}</p>
          </Card>
          <Card>
            <p className="text-caption text-text-secondary">Ultimate</p>
            <p className="mt-xs text-h1 text-text-primary">{tierCounts?.ultimate ?? '…'}</p>
          </Card>
        </div>

        <Table
          columns={columns}
          rows={consultancies.data?.items ?? []}
          rowKey={(c) => c.id!}
          loading={consultancies.isLoading}
          error={consultancies.isError ? 'Could not load consultancies.' : undefined}
          emptyMessage="No consultancies match these filters."
          sort={sort}
          onSortChange={(field, direction) => {
            setSort({ field, direction })
            resetPaging()
          }}
          search={{
            value: search,
            onChange: (value) => {
              setSearch(value)
              resetPaging()
            },
            placeholder: 'Search by name…',
          }}
          filters={
            <CompactSelect
              value={tierFilter}
              onChange={(e) => {
                setTierFilter(e.target.value)
                resetPaging()
              }}
              label="Plan"
              className="capitalize"
            >
              <option value="">Any plan</option>
              <option value="starter">Starter</option>
              <option value="business">Business</option>
              <option value="ultimate">Ultimate</option>
            </CompactSelect>
          }
          pagination={{
            hasNext: Boolean(consultancies.data?.meta.next_cursor),
            hasPrevious: paging.hasPrevious,
            onNext: () => consultancies.data?.meta.next_cursor && paging.next(consultancies.data.meta.next_cursor),
            onPrevious: paging.previous,
            total: consultancies.data?.meta.total,
          }}
        />

        {managingConsultancy && (
          <ConsultancyDetail consultancy={managingConsultancy} onClose={() => setManagingId(null)} />
        )}
      </div>
    </AdminShell>
  )
}
