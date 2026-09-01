import { useMemo, useState, type FormEvent } from 'react'
import { Pencil } from 'lucide-react'
import { AdminShell } from '@/features/auth/AdminShell'
import { Button } from '@/components/Button'
import { TextField } from '@/components/TextField'
import { Toggle } from '@/components/Toggle'
import { Table, type TableColumn } from '@/components/Table'
import { Modal } from '@/components/Modal'
import { useEarnRules, useUpdateEarnRule } from '@/queries/earnRules'
import type { components } from '@/api/schema'

type EarnRule = components['schemas']['EarnRule']

// User-requested (2026-08-18) — "Earn Rules - give muted text just like quiz_completed for
// others too." Only the 3 triggers tied to an Event (webinar_attended, physical_meeting_attended,
// quiz_completed) can be overridden per-event via that Event's own points_override field (build
// reference 1.8/1.13) — profile_completed and referral_signup aren't tied to any Event, so there's
// nothing to override them with and they're deliberately left without a caption.
const OVERRIDE_CAPTIONS: Partial<Record<string, string>> = {
  webinar_attended: 'Overridden by the Sentpo points set on an individual webinar, if any.',
  physical_meeting_attended: 'Overridden by the Sentpo points set on an individual physical meeting, if any.',
  quiz_completed: 'Overridden by the participation points set on an individual quiz, if any.',
  // User-requested (2026-08-19) — "if possible we want Sentpo points for 30% completion of
  // profile, 70% and 100%." profile_completed already covers 100%; profile_30_percent/
  // profile_70_percent are the two new intermediate milestones, added and configurable here, but
  // deliberately shipped inactive — profile editing is a Sentpo Mobile screen, and Mobile hasn't
  // been started (PROGRESS.md), so there is no code path anywhere in this environment that could
  // fire them yet. Wiring them up is a real backend feature (computing a completion percentage
  // from the student's own profile fields, tracking which milestones a student has already
  // crossed) to build once Mobile's profile-edit flow exists — not something to fake here.
  profile_completed: 'The 100% milestone — profile_30_percent/profile_70_percent below are the two earlier ones.',
  profile_30_percent:
    'Not yet wired to a live trigger — profile editing happens on Sentpo Mobile, which hasn’t been built yet.',
  profile_70_percent:
    'Not yet wired to a live trigger — profile editing happens on Sentpo Mobile, which hasn’t been built yet.',
  // Awarded once per new applicant record (user-requested, 2026-08-19 — "if possible we need
  // welcome Sentpo points") — Create Applicant and Applicant Allocation's Northstar-scoped
  // allocate both credit this the moment a new Client/journey is created, since there's no real
  // student self-signup flow in this environment to hook a "welcome" moment onto otherwise
  // (Sentpo Mobile again).
  welcome_signup:
    'Credited once, automatically, when a new applicant record is created (Create Applicant / Applicant Allocation).',
}

// User-requested (2026-08-19) — "first show welcome_signup, then profile completion related,
// then referral_signup, then rest events." Applied as the default row order (below, only when the
// admin hasn't clicked a column header to sort explicitly) — triggers not listed here fall back to
// alphabetical, after everything named.
const DEFAULT_ORDER = [
  'welcome_signup',
  'profile_30_percent',
  'profile_70_percent',
  'profile_completed',
  'referral_signup',
]

// User-requested (2026-08-18) — "Earn Rules also edit on popup." Same move as Coupons/Jobs this
// session: the old RuleEditor crammed Points + Cap TextFields and a Save button directly into the
// table row. Rewritten as an Edit-icon-opened popup; Active stays a quick inline Toggle in the
// Status column, same convention as Coupons/Jobs, since a single-purpose switch isn't the kind of
// "inline edit" being moved here. No Add flow — this page is purely an editor of the 5
// pre-seeded, always-existing rules (Ninety-eighth entry, PROGRESS.md).
function RuleFormModal({ rule, onClose }: { rule: EarnRule; onClose: () => void }) {
  const updateRule = useUpdateEarnRule(rule.id!)
  const [pointsValue, setPointsValue] = useState(rule.points_value ?? 0)
  const [cap, setCap] = useState(rule.cap != null ? String(rule.cap) : '')
  const caption = rule.trigger_type ? OVERRIDE_CAPTIONS[rule.trigger_type] : undefined

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    updateRule.mutate({ points_value: pointsValue, cap: cap ? Number(cap) : null }, { onSuccess: () => onClose() })
  }

  return (
    <Modal
      onClose={onClose}
      title={`Edit ${rule.trigger_type}`}
      widthRem={26}
      footer={
        <>
          {updateRule.isError && (
            <p className="mr-auto self-center text-body-sm text-error">{updateRule.error.message}</p>
          )}
          <Button type="submit" form="rule-form" loading={updateRule.isPending}>
            Save Changes
          </Button>
        </>
      }
    >
      <form id="rule-form" onSubmit={handleSubmit} className="flex flex-col gap-md">
        {caption && <p className="text-body-sm text-text-secondary">{caption}</p>}
        <div className="grid grid-cols-2 gap-sm">
          <TextField
            label="Points"
            type="number"
            required
            value={pointsValue}
            onChange={(e) => setPointsValue(Number(e.target.value))}
          />
          <TextField label="Cap" type="number" value={cap} onChange={(e) => setCap(e.target.value)} />
        </div>
        <p className="text-caption text-text-secondary">
          Cap is per user, lifetime — the most this trigger can ever award any single user, not a platform-wide pool.
        </p>
      </form>
    </Modal>
  )
}

// Row-level component so useUpdateEarnRule(rule.id) can be called at its own render top level —
// Table's `render: (row) => ...` runs as a callback, not a component body.
function RuleToggle({ rule }: { rule: EarnRule }) {
  const updateRule = useUpdateEarnRule(rule.id!)

  return (
    <div>
      <Toggle
        checked={Boolean(rule.active)}
        onChange={(checked) => updateRule.mutate({ active: checked })}
        label={`${rule.trigger_type} active`}
      />
    </div>
  )
}

// User-requested removal (2026-08-17) — "'A typed-in trigger would just be a dead rule' - this
// means no point having add rule. if so remove it." Correct: trigger types are a closed,
// developer-instrumented list (build reference 1.8) — a new one only exists once an app release
// actually fires it somewhere, and that release is the point it'd be seeded with its rule. There
// is no realistic point in this admin console's lifecycle where a valid, already-instrumented
// trigger exists with no rule yet to configure, so "Add Rule" (previously a free-text field, then
// a picker that showed an empty state every single time since all 5 known triggers are always
// pre-seeded) never had a legitimate use — removed entirely along with its now-dead
// `useCreateEarnRule` hook, the `POST /points/earn-rules` route, and the `EarnRuleInput` schema.
// This page is purely an editor of existing, pre-seeded rules now: points value, cap, active
// toggle — no create flow.
export function EarnRulesPage() {
  const rules = useEarnRules()
  const [editingId, setEditingId] = useState<string | null>(null)
  const [sort, setSort] = useState<{ field: string; direction: 'asc' | 'desc' } | null>(null)
  const [search, setSearch] = useState('')

  const rows = useMemo(() => {
    let items = rules.data ?? []
    if (search) {
      const q = search.toLowerCase()
      items = items.filter((r) => r.trigger_type?.toLowerCase().includes(q))
    }
    if (sort) {
      const dir = sort.direction === 'desc' ? -1 : 1
      items = [...items].sort((a, b) => {
        const av =
          sort.field === 'active'
            ? a.active
              ? 1
              : 0
            : sort.field === 'points_value'
              ? (a.points_value ?? 0)
              : (a.trigger_type ?? '').toLowerCase()
        const bv =
          sort.field === 'active'
            ? b.active
              ? 1
              : 0
            : sort.field === 'points_value'
              ? (b.points_value ?? 0)
              : (b.trigger_type ?? '').toLowerCase()
        return av < bv ? -1 * dir : av > bv ? 1 * dir : 0
      })
    } else {
      items = [...items].sort((a, b) => {
        const ai = DEFAULT_ORDER.indexOf(a.trigger_type ?? '')
        const bi = DEFAULT_ORDER.indexOf(b.trigger_type ?? '')
        if (ai !== -1 || bi !== -1)
          return (ai === -1 ? DEFAULT_ORDER.length : ai) - (bi === -1 ? DEFAULT_ORDER.length : bi)
        return (a.trigger_type ?? '').localeCompare(b.trigger_type ?? '')
      })
    }
    return items
  }, [rules.data, search, sort])

  const editingRule = editingId ? rows.find((r) => r.id === editingId) : undefined

  const columns: TableColumn<EarnRule>[] = [
    {
      key: 'trigger_type',
      header: 'Trigger',
      sortable: true,
      render: (r) => {
        const caption = r.trigger_type ? OVERRIDE_CAPTIONS[r.trigger_type] : undefined
        return (
          <div>
            <span className="font-medium text-text-primary">{r.trigger_type}</span>
            {caption && <p className="text-caption text-text-secondary">{caption}</p>}
          </div>
        )
      },
    },
    {
      key: 'points_value',
      header: 'Points',
      sortable: true,
      align: 'right',
      render: (r) => `${r.points_value ?? 0} pts`,
    },
    {
      key: 'cap',
      header: 'Cap',
      align: 'right',
      render: (r) => (
        <div>
          <span>{r.cap != null ? r.cap : 'No cap'}</span>
          {/* User-requested (2026-08-18) — "referral_signup, is the cap per sentpo user? Be
              clear and add that as muted text." Per user, lifetime — build reference 3.6
              documents cap-checking as locked against "the same per-user ledger" a coupon
              redemption's balance check uses, i.e. this is a ceiling on how many total points
              that one user can ever earn from this trigger, not a platform-wide pool shared
              across every user. Shown for every capped rule, not just referral_signup, since
              quiz_completed's existing cap is exactly as ambiguous without this. */}
          {r.cap != null && <p className="text-caption text-text-secondary">Per user, lifetime</p>}
        </div>
      ),
    },
    { key: 'active', header: 'Status', render: (r) => <RuleToggle rule={r} /> },
    {
      key: 'actions',
      header: '',
      align: 'right',
      render: (r) => (
        <div className="flex justify-end">
          <button
            type="button"
            onClick={() => setEditingId(r.id!)}
            aria-label={`Edit ${r.trigger_type}`}
            title="Edit"
            className="flex h-9 w-9 items-center justify-center rounded-md text-text-secondary hover:bg-background hover:text-text-primary"
          >
            <Pencil className="h-4 w-4" />
          </button>
        </div>
      ),
    },
  ]

  return (
    <AdminShell>
      <div className="flex flex-col gap-lg">
        <div>
          <h1 className="text-h1 text-text-primary">Earn Rules</h1>
          <p className="text-body-sm text-text-secondary">
            Points awarded per developer-instrumented trigger event — each trigger ships pre-seeded with its rule; edit
            the point value, cap, or active state below.
          </p>
        </div>

        {editingRule && <RuleFormModal rule={editingRule} onClose={() => setEditingId(null)} />}

        <Table
          columns={columns}
          rows={rows}
          rowKey={(r) => r.id!}
          loading={rules.isLoading}
          error={rules.isError ? 'Could not load earn rules.' : undefined}
          emptyMessage="No earn rules yet."
          sort={sort}
          onSortChange={(field, direction) => setSort({ field, direction })}
          search={{ value: search, onChange: setSearch, placeholder: 'Search trigger…' }}
        />
      </div>
    </AdminShell>
  )
}
