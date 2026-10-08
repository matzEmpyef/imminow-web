import type { components } from '@/api/schema'

export type CaseCarry = components['schemas']['CaseCarry']
export type CarriedItem = components['schemas']['CarriedItem']

/**
 * What goes with a case when it moves to another consultancy (owner's ruling on review I-014,
 * 2026-10-08: the person making the move decides). One list for the three dialogs that move a
 * case and for the "Carried over" line the receiving consultancy reads, so the four things are
 * named the same everywhere. The order is the server's fixed order.
 */
export const CARRY_ITEMS: readonly { key: CarriedItem; label: string; helper: string }[] = [
  { key: 'documents', label: 'Documents', helper: 'the documents the student has shared' },
  { key: 'applications', label: 'College applications', helper: 'applications already made, with their status' },
  { key: 'preferences', label: 'Case preferences', helper: 'chosen country and how the student pays' },
  { key: 'chat', label: 'Earlier conversation', helper: 'the chat with the previous consultancy, read-only' },
]

/** Doing nothing gives the documents only — the receiving consultancy starts fresh on the rest. */
export const DEFAULT_CARRY: CaseCarry = { documents: true, applications: false, preferences: false, chat: false }

/** "documents, college applications" — the same four names as the tick boxes, in lower case. */
function carriedNames(carried: readonly CarriedItem[]): string {
  return CARRY_ITEMS.filter((item) => carried.includes(item.key))
    .map((item) => item.label.toLowerCase())
    .join(', ')
}

/** What the person who made the move is told, from the server's own `carried` answer. */
export function movedSentence(carried: readonly CarriedItem[] | null | undefined): string {
  const names = carriedNames(carried ?? [])
  return names ? `Moved. Shared: ${names}.` : 'Moved. Nothing was shared.'
}

/**
 * The receiving consultancy's line, from `Client.carried`: null (the case did not arrive by a
 * move) says nothing, an empty list says "nothing".
 */
export function carriedOverLine(carried: readonly CarriedItem[] | null | undefined): string | null {
  if (carried == null) return null
  return `Carried over: ${carriedNames(carried) || 'nothing'}`
}
