import { formatMoney } from '@/lib/money'
import type { components } from '@/api/schema'

type AuditLogEntry = components['schemas']['AuditLogEntry']

/** What the server puts in place of a reason that went with an erased account. Shown as it is. */
export const ERASED_REASON = '[erased]'

/**
 * How search works on both audit logs since lane w: a reason someone typed about a person is kept
 * sealed with that person's data, so its words are no longer matched. One sentence, both pages.
 */
export const AUDIT_SEARCH_HINT =
  'Search finds an entry by the name of the person or record it is about, or by who made the change. ' +
  'A reason typed about a person cannot be searched by its words: use the name, the actor, the area or the dates.'

export const AUDIT_SEARCH_PLACEHOLDER = 'Search name, record or actor…'

/** A diff value is usually a `[before, after]` pair; anything else is taken as the value itself. */
function beforeAfter(value: unknown): { before: unknown; after: unknown } {
  if (Array.isArray(value) && value.length === 2) return { before: value[0], after: value[1] }
  return { before: null, after: value }
}

function changeText(value: unknown, format: (v: unknown) => string | null): string | null {
  const { before, after } = beforeAfter(value)
  const now = after == null ? null : format(after)
  const was = before == null ? null : format(before)
  if (now && was && now !== was) return `${was} → ${now}`
  return now ?? (was ? `${was} (removed)` : null)
}

const asMoney = (v: unknown) => (typeof v === 'number' ? formatMoney('INR', v) : null)
const asText = (v: unknown) => (typeof v === 'string' && v ? v : typeof v === 'number' ? String(v) : null)

/**
 * The facts that used to be written into a freelancer entry's label and now travel in its `diff`
 * (lane w): the amount of a payout, and the referral code of an invite or a code change. Read out
 * as plain lines so nobody has to find them in the raw change below.
 */
const KNOWN_FACTS: { key: string; label: string; format: (v: unknown) => string | null }[] = [
  { key: 'amount_inr', label: 'Amount', format: asMoney },
  { key: 'referral_code', label: 'Referral code', format: asText },
]

/**
 * The expanded row of an audit entry, shared by the consultancy's log and the platform's: the
 * reason, the facts worth reading at a glance, and the recorded change in full.
 *
 * A reason reads `[erased]` once the account it was about has been erased (lane w). That text is
 * shown exactly as the server sends it, with one line saying what it means.
 */
export function AuditEntryDetail({ entry }: { entry: Pick<AuditLogEntry, 'reason' | 'diff'> }) {
  const diff = entry.diff ?? null
  const facts = diff
    ? KNOWN_FACTS.flatMap((fact) => {
        if (!(fact.key in diff)) return []
        const text = changeText(diff[fact.key], fact.format)
        return text ? [{ label: fact.label, text }] : []
      })
    : []

  return (
    <div className="flex flex-col gap-xs">
      {entry.reason && (
        <div className="flex flex-col gap-0.5">
          <p className="text-body-sm text-text-primary">
            <span className="font-medium">Reason:</span> {entry.reason}
          </p>
          {entry.reason === ERASED_REASON && (
            <p className="text-caption text-text-secondary">
              This reason was removed when the person&rsquo;s account was erased.
            </p>
          )}
        </div>
      )}
      {facts.map((fact) => (
        <p key={fact.label} className="text-body-sm text-text-primary">
          <span className="font-medium">{fact.label}:</span> {fact.text}
        </p>
      ))}
      {diff && (
        <pre className="overflow-x-auto rounded-md bg-surface p-sm text-caption text-text-secondary">
          {JSON.stringify(diff, null, 2)}
        </pre>
      )}
      {!entry.reason && !diff && <p className="text-body-sm text-text-secondary">No further detail recorded.</p>}
    </div>
  )
}
