import { humaniseCode } from '@/lib/humanise'
import { formatDate, formatDateTime } from '@/lib/time'

/**
 * Plain words for an audit entry (T4-24). The log used to show the server's codes and the raw
 * change: "Update — Journey", {"status": ["active","closed"]}, "Reason: lost_contact". Here each
 * entry becomes a sentence a person who has never seen the platform can read: who, what, when,
 * and the old and new values in words. Ids never appear.
 */

/** The server's name for a record, in the console's name for it. `journey` is a case. */
const ENTITY_LABELS: Record<string, string> = {
  journey: 'Case',
  client: 'Client',
  lead: 'Lead',
  kyc: 'KYC',
}

export function entityWord(entityType: string): string {
  return ENTITY_LABELS[entityType] ?? humaniseCode(entityType).replace(/\bkyc\b/gi, 'KYC')
}

/** A field name, in words. Names that end in an id are hidden elsewhere, so none reach here. */
const FIELD_LABELS: Record<string, string> = {
  status: 'Status',
  closed_reason: 'Reason for closing',
  close_sub_reason: 'Reason for closing',
  outcome: 'Outcome',
  name: 'Name',
  email: 'Email',
  phone: 'Phone',
  tags: 'Tags',
  active: 'Active',
}

function fieldWord(key: string): string {
  return FIELD_LABELS[key] ?? humaniseCode(key)
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const ISO_DATE_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/
const CODE = /^[a-z0-9]+(_[a-z0-9]+)+$/

/** Codes whose words are not simply the code spelt out. */
const CODE_WORDS: Record<string, string> = {
  under_age: 'under 16',
}

function codeWords(code: string): string {
  return CODE_WORDS[code] ?? humaniseCode(code).toLowerCase()
}

/** A field that only identifies a record, which nobody reading the log can use. */
function isIdField(key: string): boolean {
  return key === 'id' || key.endsWith('_id') || key.endsWith('_ids')
}

/** A value in words, or null when there is nothing worth saying (empty, an id, a nested record). */
export function auditValue(value: unknown): string | null {
  if (value == null || value === '') return null
  if (typeof value === 'boolean') return value ? 'yes' : 'no'
  if (typeof value === 'number') return String(value)
  if (typeof value === 'string') {
    if (UUID.test(value)) return null
    if (ISO_DATE_TIME.test(value)) return formatDateTime(value)
    if (ISO_DATE.test(value)) return formatDate(value)
    if (CODE.test(value)) return codeWords(value)
    return value
  }
  if (Array.isArray(value)) {
    const parts = value.map(auditValue).filter((v): v is string => v !== null)
    return parts.length ? parts.join(', ') : null
  }
  return null
}

function capital(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1)
}

/** One field's change as a sentence, or null when it says nothing a reader can use. */
export function changeSentence(key: string, change: unknown): string | null {
  if (isIdField(key)) return null
  const pair = Array.isArray(change) && change.length === 2
  const before = pair ? auditValue((change as unknown[])[0]) : null
  const after = auditValue(pair ? (change as unknown[])[1] : change)
  const label = fieldWord(key)
  if (before && after) return before === after ? null : `${label} changed from ${before} to ${after}.`
  if (after) return pair ? `${label} set to ${after}.` : `${label}: ${after}.`
  if (before) return `${label} cleared (it was ${before}).`
  return null
}

/** Every readable sentence of a change, skipping the keys in `skip` (already read out elsewhere). */
export function changeSentences(
  diff: Record<string, unknown> | null | undefined,
  skip: ReadonlySet<string> = new Set(),
): string[] {
  if (!diff) return []
  return Object.entries(diff)
    .filter(([key]) => !skip.has(key))
    .map(([key, change]) => changeSentence(key, change))
    .filter((s): s is string => s !== null)
}

interface EntryLike {
  actor_name?: string | null
  action_type?: string
  entity_type?: string
  entity_label?: string | null
  created_at?: string
  diff?: Record<string, unknown> | null
}

/**
 * Names for the entries whose bare "Update" says nothing: a case or a lead closing or coming back.
 * Null when the entry has no better name than its action.
 */
export function entryTitle(entry: EntryLike): string | null {
  if (entry.action_type !== 'update' || (entry.entity_type !== 'journey' && entry.entity_type !== 'lead')) return null
  const noun = entry.entity_type === 'journey' ? 'Case' : 'Lead'
  const status = entry.diff?.status
  if (!Array.isArray(status) || status.length !== 2) return null
  const before = String(status[0])
  const after = String(status[1])
  if (after === 'closed') return `${noun} closed`
  if (before === 'closed') return `${noun} reopened`
  return null
}

/** Who did what to which record, and when, as one sentence. */
export function entrySentence(entry: EntryLike): string | null {
  if (!entry.created_at) return null
  const who = entry.actor_name ?? 'Someone'
  const when = formatDateTime(entry.created_at)
  const record = entry.entity_type ? entityWord(entry.entity_type).toLowerCase() : 'record'
  const label = entry.entity_label ? ` ${entry.entity_label}` : ''
  const title = entryTitle(entry)
  if (title === 'Case closed') return `${who} closed the case of${label || ' a client'} on ${when}.`
  if (title === 'Case reopened') return `${who} reopened the case of${label || ' a client'} on ${when}.`
  if (title === 'Lead closed') return `${who} closed the lead${label} on ${when}.`
  if (title === 'Lead reopened') return `${who} reopened the lead${label} on ${when}.`
  const verb = entry.action_type === 'create' ? 'added' : entry.action_type === 'delete' ? 'removed' : 'changed'
  return `${who} ${verb} the ${record}${label} on ${when}.`
}

/** A reason that arrived as a code ("lost_contact") reads as words; one a person typed is left alone. */
export function reasonText(reason: string): string {
  return CODE.test(reason) ? capital(codeWords(reason)) : reason
}
