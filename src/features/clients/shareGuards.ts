import { ApiError } from '@/api/errors'

/**
 * Posting the same share twice in a row (chat UX, product owner 2026-09-19).
 *
 * The server now refuses a course/college/search/shortlist share that repeats the one already
 * sitting at the end of the conversation, with **409 `duplicate_share`**. Two halves here:
 *
 *  - {@link duplicateShareMessage} turns that refusal into the sentence the consultant reads,
 *    shown inline beside the composer the way a failed send is. Never retried — the answer would
 *    be the same — and nothing typed is cleared.
 *  - {@link isRepeatOfLastShare} stops the action being offered at all while the previous message
 *    IS that share by this sender, so the refusal is something a consultant meets only in a race
 *    (two tabs, or a colleague sending the same thing a second earlier), not in normal use.
 */
export const DUPLICATE_SHARE_MESSAGE = "You just shared this — it's already in the conversation."

/** The server's own wording when it has one, our sentence when it does not. */
export function duplicateShareMessage(error: unknown): string {
  if (error instanceof ApiError && error.code === 'duplicate_share') {
    return error.message || DUPLICATE_SHARE_MESSAGE
  }
  return error instanceof Error ? error.message : 'Could not send this.'
}

/** The shape every chat message list here shares, narrowed to what the guard reads. */
interface ShareableMessage {
  type?: string
  sender?: string
  shared_course?: { id?: string } | null
  shared_college?: { id?: string } | null
  shared_search?: { filters?: Record<string, string> } | null
}

/** Stable across key order, so two identical filter sets always compare equal. */
export function shareFilterFingerprint(filters: Record<string, string> | undefined): string {
  return JSON.stringify(Object.entries(filters ?? {}).sort(([a], [b]) => a.localeCompare(b)))
}

/**
 * True when the LAST message in the thread is already this exact share from this sender.
 *
 * Deliberately only the last message, not "anywhere in the thread": re-sharing a course three
 * weeks and forty messages later is a normal thing to do, and the rule the server enforces is
 * about the immediately preceding message.
 */
export function isRepeatOfLastShare(
  messages: ShareableMessage[] | undefined,
  sender: string,
  share:
    | { kind: 'course'; id: string }
    | { kind: 'college'; id: string }
    | { kind: 'search'; filters: Record<string, string> },
): boolean {
  const last = messages?.[messages.length - 1]
  if (!last || last.sender !== sender) return false
  if (share.kind === 'course') return last.type === 'course_share' && last.shared_course?.id === share.id
  if (share.kind === 'college') return last.type === 'college_share' && last.shared_college?.id === share.id
  return (
    last.type === 'search_share' &&
    shareFilterFingerprint(last.shared_search?.filters) === shareFilterFingerprint(share.filters)
  )
}
