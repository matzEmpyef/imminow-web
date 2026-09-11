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

// Plain-English label for each developer-instrumented trigger code (user-requested, 2026-09-11 —
// admins were reading raw codes like `profile_30_percent` with no translation). The code itself
// still shows, small and muted, under the label — useful when reporting a bug or cross-checking
// against build reference 1.8. Unknown codes (should never happen — the enum is closed) fall back
// to showing the code as the label.
const TRIGGER_LABELS: Partial<Record<string, string>> = {
  welcome_signup: 'Signs up',
  profile_30_percent: 'Profile 30% complete',
  profile_70_percent: 'Profile 70% complete',
  profile_completed: 'Profile 100% complete',
  referral_signup: 'A friend they referred signs up',
  article_read: 'Reads a blog article',
  consultancy_viewed: 'Views a consultancy profile',
  daily_login: 'Opens the app (once a day)',
  physical_meeting_attended: 'Attends an in-person meeting',
  quiz_completed: 'Completes a quiz',
  webinar_attended: 'Attends a webinar',
}

function triggerLabel(code?: string): string {
  if (!code) return ''
  return TRIGGER_LABELS[code] ?? code
}

// Rows are grouped under these headings (user-requested, 2026-09-11) rather than sorted into one
// flat list — Profile/Engagement/Events reads as three small, scannable sections instead of an
// 11-row table the admin has to scan for the trigger they want. Every trigger in the closed enum
// (build reference 1.8) has exactly one home here.
const GROUPS: { heading: string; triggers: string[] }[] = [
  { heading: 'Profile', triggers: ['welcome_signup', 'profile_30_percent', 'profile_70_percent', 'profile_completed'] },
  { heading: 'Engagement', triggers: ['daily_login', 'article_read', 'consultancy_viewed', 'referral_signup'] },
  { heading: 'Events', triggers: ['webinar_attended', 'physical_meeting_attended', 'quiz_completed'] },
]

// User-requested (2026-08-18) — "Earn Rules - give muted text just like quiz_completed for
// others too." Only the 3 triggers tied to an Event (webinar_attended, physical_meeting_attended,
// quiz_completed) can be overridden per-event via that Event's own points_override field (build
// reference 1.8/1.13) — profile_completed and referral_signup aren't tied to any Event, so there's
// nothing to override them with and they're deliberately left without a caption.
const OVERRIDE_CAPTIONS: Partial<Record<string, string>> = {
  webinar_attended: 'Overridden by the Sentpo points set on an individual webinar, if any.',
  physical_meeting_attended: 'Overridden by the Sentpo points set on an individual physical meeting, if any.',
  quiz_completed: 'Overridden by the participation points set on an individual quiz, if any.',
  // profile_completed is the 100% milestone; profile_30_percent/profile_70_percent (below) are
  // the two earlier ones — worded without a positional "below" reference (2026-09-11) since the
  // three no longer necessarily render adjacent to each other.
  profile_completed: 'The 100% milestone — profile_30_percent and profile_70_percent are the two earlier ones.',
  // Corrected 2026-09-11 — these were shipped inactive pending a Sentpo Mobile profile-edit
  // screen that has since been built; the server now fires both live, the moment a student's
  // profile crosses the threshold. The old "not yet wired… hasn't been built" copy was stale.
  profile_30_percent: 'Awarded automatically the moment the student’s profile crosses 30% complete.',
  profile_70_percent: 'Awarded automatically the moment the student’s profile crosses 70% complete.',
  // Awarded once per new applicant record (user-requested, 2026-08-19 — "if possible we need
  // welcome Sentpo points") — Create Applicant and Applicant Allocation's Northstar-scoped
  // allocate both credit this the moment a new Client/journey is created, since there's no real
  // student self-signup flow in this environment to hook a "welcome" moment onto otherwise
  // (Sentpo Mobile again).
  welcome_signup:
    'Credited once, automatically, when a new applicant record is created (Create Applicant / Applicant Allocation).',
}

// User-requested (2026-08-18) — "Earn Rules also edit on popup." Same move as Coupons/Jobs this
// session: the old RuleEditor crammed Points + Cap TextFields and a Save button directly into the
// table row. Rewritten as an Edit-icon-opened popup; Active stays a quick inline Toggle in the
// Status column, same convention as Coupons/Jobs, since a single-purpose switch isn't the kind of
// "inline edit" being moved here. No Add flow — this page is purely an editor of the pre-seeded,
// always-existing rules (Ninety-eighth entry, PROGRESS.md).
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
      // Human label instead of the raw code (2026-09-11) — "Edit profile_30_percent" read like a
      // debug screen.
      title={`Edit ${triggerLabel(rule.trigger_type)}`}
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
        label={`${triggerLabel(rule.trigger_type)} active`}
        size="sm"
      />
    </div>
  )
}

// User-requested removal (2026-08-17) — "'A typed-in trigger would just be a dead rule' - this
// means no point having add rule. if so remove it." Correct: trigger types are a closed,
// developer-instrumented list (build reference 1.8) — a new one only exists once an app release
// actually fires it somewhere, and that release is the point it'd be seeded with its rule. There
// is no realistic point in this admin console's lifecycle where a valid, already-instrumented
// trigger exists with no rule yet to configure, so "Add Rule" never had a legitimate use — removed
// entirely along with its now-dead `useCreateEarnRule` hook, the `POST /points/earn-rules` route,
// and the `EarnRuleInput` schema. This page is purely an editor of existing, pre-seeded rules now:
// points value, cap, active toggle — no create flow.
export function EarnRulesPage() {
  const rules = useEarnRules()
  const [editingId, setEditingId] = useState<string | null>(null)
  const [search, setSearch] = useState('')

  const filteredRules = useMemo(() => {
    const all = rules.data ?? []
    if (!search) return all
    const q = search.toLowerCase()
    return all.filter(
      (r) => triggerLabel(r.trigger_type).toLowerCase().includes(q) || (r.trigger_type ?? '').toLowerCase().includes(q),
    )
  }, [rules.data, search])

  const editingRule = editingId ? filteredRules.find((r) => r.id === editingId) : undefined

  const columns: TableColumn<EarnRule>[] = [
    {
      key: 'trigger_type',
      header: 'Trigger',
      render: (r) => {
        const caption = r.trigger_type ? OVERRIDE_CAPTIONS[r.trigger_type] : undefined
        return (
          <div>
            <span className="font-medium text-text-primary">{triggerLabel(r.trigger_type)}</span>
            <p className="font-mono text-caption text-text-secondary">{r.trigger_type}</p>
            {caption && <p className="text-caption text-text-secondary">{caption}</p>}
          </div>
        )
      },
    },
    {
      key: 'points_value',
      width: '7rem',
      header: 'Points',
      align: 'right',
      render: (r) => `${r.points_value ?? 0} pts`,
    },
    {
      key: 'cap',
      width: '10rem',
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
    { key: 'active', header: 'Status', width: '6rem', render: (r) => <RuleToggle rule={r} /> },
    {
      key: 'actions',
      width: '4rem',
      header: '',
      align: 'right',
      render: (r) => (
        <div className="flex justify-end">
          <button
            type="button"
            onClick={() => setEditingId(r.id!)}
            aria-label={`Edit ${triggerLabel(r.trigger_type)}`}
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
            The points a student earns for each action in the Sentpo app. Change how many points an action is worth,
            cap how many a student can earn from it in total, or switch it off. New actions arrive with an app release.
          </p>
        </div>

        {editingRule && <RuleFormModal rule={editingRule} onClose={() => setEditingId(null)} />}

        {/* One white card for search and all three groups (user, 2026-09-11) — the group
            headings used to sit on the grey page between three separate table cards. */}
        <div className="flex flex-col rounded-lg bg-surface shadow-card">
          <div className="border-b border-border p-md">
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search trigger…"
              style={{ maxWidth: '20rem' }}
              className="h-10 w-full rounded-full border border-border bg-background px-md text-body-sm text-text-primary outline-none focus:border-2 focus:border-primary"
            />
          </div>

          {rules.isLoading && <p className="p-md text-body-sm text-text-secondary">Loading…</p>}
          {rules.isError && <p className="p-md text-body-sm text-error">Could not load earn rules.</p>}

          {!rules.isLoading &&
            !rules.isError &&
            (filteredRules.length === 0 ? (
              <p className="p-md text-body-sm text-text-secondary">No earn rules match your search.</p>
            ) : (
              GROUPS.map((group) => {
                const rows = group.triggers
                  .map((t) => filteredRules.find((r) => r.trigger_type === t))
                  .filter((r): r is EarnRule => Boolean(r))
                if (rows.length === 0) return null
                return (
                  <section key={group.heading} className="flex flex-col border-b border-border last:border-b-0">
                    <h2 className="px-md pt-md text-caption font-medium uppercase tracking-wide text-text-secondary">
                      {group.heading}
                    </h2>
                    <Table bare columns={columns} rows={rows} rowKey={(r) => r.id!} emptyMessage="No earn rules yet." />
                  </section>
                )
              })
            ))}
        </div>
      </div>
    </AdminShell>
  )
}
