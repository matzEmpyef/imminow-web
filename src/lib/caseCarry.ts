import type { components } from '@/api/schema'

export type CarriedItem = components['schemas']['CarriedItem']
/** What goes with a case: the contract's own `CaseCarry`, all six keys. */
export type CaseCarry = components['schemas']['CaseCarry']

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
export const DEFAULT_CARRY: CaseCarry = {
  documents: true,
  applications: false,
  preferences: false,
  chat: false,
  admission: false,
  recorded_payments: false,
}

/**
 * What is sent: the recorded money moves only together with the admission (the server refuses
 * `recorded_payments` without `admission`), so it goes as false unless the admission goes too.
 */
export function carryForSend(carry: CaseCarry): CaseCarry {
  return { ...carry, recorded_payments: carry.admission && carry.recorded_payments }
}

/** "documents, college applications" — the same four names as the tick boxes, in lower case. */
function carriedNames(carried: readonly string[]): string {
  const names = CARRY_ITEMS.filter((item) => carried.includes(item.key)).map((item) => item.label.toLowerCase())
  // `admission` and `recorded_payments` are not tick boxes: they say the accepted college, and the
  // money already recorded on it, went with the case.
  if (carried.includes('admission')) names.push('accepted college')
  if (carried.includes('recorded_payments')) names.push('recorded payments')
  return names.join(', ')
}

/** What the person who made the move is told, from the server's own `carried` answer. */
export function movedSentence(carried: readonly string[] | null | undefined): string {
  const names = carriedNames(carried ?? [])
  return names ? `Moved. Shared: ${names}.` : 'Moved. Nothing was shared.'
}

/**
 * The receiving consultancy's line, from `Client.carried`: null (the case did not arrive by a
 * move) says nothing, an empty list says "nothing".
 */
export function carriedOverLine(carried: readonly string[] | null | undefined): string | null {
  if (carried == null) return null
  return `Carried over: ${carriedNames(carried) || 'nothing'}`
}

/**
 * Which of the two extra questions a move form asks, from the flags the server serves on the
 * form's own read (`has_accepted_college`, `has_recorded_payments`): whether the admission goes
 * too, and — only when it is asked and money is recorded on it — whether that money goes too.
 */
export function carryQuestions(
  served: { has_accepted_college?: boolean; has_recorded_payments?: boolean } | null | undefined,
): { admission: boolean; payments: boolean } {
  const admission = served?.has_accepted_college === true
  return { admission, payments: admission && served?.has_recorded_payments === true }
}
