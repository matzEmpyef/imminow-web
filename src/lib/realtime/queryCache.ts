import type { InfiniteData, QueryClient } from '@tanstack/react-query'
import type { components } from '@/api/schema'
import { internalThreadIdOrTeam, type RealtimeInternalRef, type RealtimeThreadRef } from './frame'

type LeadMessage = components['schemas']['LeadMessage']
type Conversation = components['schemas']['Conversation']
type InternalChatMessage = components['schemas']['InternalChatMessage']

export interface MessagesPage {
  items: LeadMessage[]
  meta: { next_cursor?: string | null; total?: number | null }
}

interface InternalMessagesPage {
  items: InternalChatMessage[]
  meta: { next_cursor?: string | null; total?: number | null }
}

interface ConversationsPage {
  items: Conversation[]
  meta: { next_cursor?: string | null; total: number; unread_count: number }
}

/** `['leads', id, 'messages']` or `['clients', id, 'messages']` — the `useInfiniteQuery` key
 * `useLeadMessages` / `useClientMessages` (queries/threadMessages.ts) read and page with
 * `before`/`limit` (review F-029), newest page first like the internal threads below. */
export function threadMessagesKey(thread: RealtimeThreadRef): [string, string, string] {
  return [thread.type === 'lead' ? 'leads' : 'clients', thread.id, 'messages']
}

/**
 * `chat.message` — append the new message to the NEWEST loaded page of the open thread
 * (`pages[0]`: `fetchNextPage` only ever adds OLDER pages after it), if the thread is cached at
 * all (nothing to patch when nobody has it open). De-duped by id across every loaded page: a
 * message the CURRENT console user just sent arrives back over the socket too (every recipient,
 * including the sender's other connections, gets the fan-out), and `useSendLeadMessage` /
 * `useSendClientMessage` put their own answer into this cache through this same function —
 * whichever lands second is a no-op.
 */
export function applyChatMessage(queryClient: QueryClient, thread: RealtimeThreadRef, message: LeadMessage): void {
  const key = threadMessagesKey(thread)
  queryClient.setQueryData<InfiniteData<MessagesPage>>(key, (old) => {
    if (!old || old.pages.length === 0) return old
    if (old.pages.some((page) => page.items.some((m) => m.id === message.id))) return old
    const pages = [...old.pages]
    pages[0] = { ...pages[0], items: [...pages[0].items, message] }
    return { ...old, pages }
  })
}

/**
 * The fallback poll's patch once older pages are loaded (review F-029). Refetching an infinite
 * query refetches every loaded page, so a consultant who had scrolled back ten pages would ask for
 * ten pages every five seconds while the socket is down. The poll asks for the newest page only
 * and this folds it in: a message already loaded is replaced in place (its status may have moved),
 * a new one is appended to the newest page. Nothing is removed and no page boundary moves.
 */
export function mergeNewestMessages(queryClient: QueryClient, thread: RealtimeThreadRef, newest: LeadMessage[]): void {
  const key = threadMessagesKey(thread)
  queryClient.setQueryData<InfiniteData<MessagesPage>>(key, (old) => {
    if (!old || old.pages.length === 0) return old
    const fresh = new Map(newest.map((m) => [m.id, m]))
    let changed = false
    const pages = old.pages.map((page) => {
      let pageChanged = false
      const items = page.items.map((m) => {
        const update = fresh.get(m.id)
        if (!update) return m
        fresh.delete(m.id)
        if (update.status === m.status) return m
        pageChanged = true
        return update
      })
      if (!pageChanged) return page
      changed = true
      return { ...page, items }
    })
    // What is left in `fresh` was in no loaded page: it is new, and `newest` is oldest-to-newest.
    const added = newest.filter((m) => fresh.has(m.id))
    if (added.length > 0) {
      changed = true
      pages[0] = { ...pages[0], items: [...pages[0].items, ...added] }
    }
    return changed ? { ...old, pages } : old
  })
}

/** `['internal-conversations', idOrTeam, 'messages']` — the `useInfiniteQuery` key
 * `useInternalConversationMessages` (queries/internalMessages.ts) reads and pages with
 * `before`/`limit` (contract gate 9, K12). */
export function internalMessagesKey(idOrTeam: string): [string, string, string] {
  return ['internal-conversations', idOrTeam, 'messages']
}

/**
 * `internal.message` (contract gate 9, K11) — append to the NEWEST loaded page (`pages[0]`, since
 * `fetchNextPage` only ever extends the array with OLDER pages, same convention
 * `queries/internalMessages.ts` pages by). Nothing to patch when the thread isn't cached at all,
 * same as `applyChatMessage`. De-duped by id for the same reason: the sender's own connection gets
 * this frame back too, and `useSendInternalMessage`'s own invalidate could race it.
 */
export function applyInternalMessage(
  queryClient: QueryClient,
  thread: RealtimeInternalRef,
  message: InternalChatMessage,
): void {
  const key = internalMessagesKey(internalThreadIdOrTeam(thread))
  queryClient.setQueryData<InfiniteData<InternalMessagesPage>>(key, (old) => {
    if (!old || old.pages.length === 0) return old
    const newest = old.pages[0]
    if (newest.items.some((m) => m.id === message.id)) return old
    const pages = [...old.pages]
    pages[0] = { ...newest, items: [...newest.items, message] }
    return { ...old, pages }
  })
  // No `conversation.updated` equivalent is emitted for internal messaging (asyncapi.yaml) — the
  // Internal Messaging list and the Global Chat Drawer's unioned rows both just refetch.
  queryClient.invalidateQueries({ queryKey: ['internal-conversations'] })
  queryClient.invalidateQueries({ queryKey: ['conversations'] })
}

/** `internal.unsent` — removes the message from wherever it's cached, across every loaded page. */
export function applyInternalUnsent(queryClient: QueryClient, thread: RealtimeInternalRef, messageId: string): void {
  const key = internalMessagesKey(internalThreadIdOrTeam(thread))
  queryClient.setQueryData<InfiniteData<InternalMessagesPage>>(key, (old) => {
    if (!old) return old
    let changed = false
    const pages = old.pages.map((page) => {
      if (!page.items.some((m) => m.id === messageId)) return page
      changed = true
      return { ...page, items: page.items.filter((m) => m.id !== messageId) }
    })
    return changed ? { ...old, pages } : old
  })
  queryClient.invalidateQueries({ queryKey: ['internal-conversations'] })
  queryClient.invalidateQueries({ queryKey: ['conversations'] })
}

const STATUS_RANK: Record<string, number> = { sent: 0, delivered: 1, read: 2 }

/**
 * `chat.delivered` / `chat.read` — `side` is whose marker moved, i.e. the receiver; the messages
 * that just became delivered/read are the ones the OTHER party sent — `LeadMessage.sender !==
 * side`. Only ever moves a message's status up the sent→delivered→read ladder, never back down
 * (an out-of-order `chat.delivered` arriving after a `chat.read` must not downgrade it).
 */
export function applyChatStatus(
  queryClient: QueryClient,
  thread: RealtimeThreadRef,
  targetStatus: 'delivered' | 'read',
  side: 'student' | 'consultant',
  upTo: string,
): void {
  const key = threadMessagesKey(thread)
  const upToMs = new Date(upTo).getTime()
  // Every loaded page: a read marker reaches back past the newest page as far as it reaches.
  queryClient.setQueryData<InfiniteData<MessagesPage>>(key, (old) => {
    if (!old) return old
    let changed = false
    const pages = old.pages.map((page) => {
      let pageChanged = false
      const items = page.items.map((m) => {
        if (m.sender === side) return m
        if (new Date(m.created_at).getTime() > upToMs) return m
        const currentRank = STATUS_RANK[m.status ?? 'sent']
        if (currentRank >= STATUS_RANK[targetStatus]) return m
        pageChanged = true
        return { ...m, status: targetStatus }
      })
      if (!pageChanged) return page
      changed = true
      return { ...page, items }
    })
    return changed ? { ...old, pages } : old
  })
}

function sameConversation(a: Conversation, b: Conversation): boolean {
  return a.id === b.id && a.type === b.type
}

/**
 * `conversation.updated` — patches the row in place wherever it's cached: the header badge's
 * unpaged `['conversations']` read, and every page of the drawer's own paged/searched
 * `['conversations', 'list', search]` (queries/conversations.ts). A conversation not currently
 * cached (not yet loaded, or filtered out of the current search) is simply not there to patch —
 * it'll arrive correctly ordered next time that query runs.
 */
export function applyConversationUpdated(queryClient: QueryClient, conversation: Conversation): void {
  queryClient.setQueryData<ConversationsPage>(['conversations'], (old) => {
    if (!old) return old
    let changed = false
    const items = old.items.map((c) => {
      if (!sameConversation(c, conversation)) return c
      changed = true
      return { ...c, ...conversation }
    })
    return changed ? { ...old, items } : old
  })

  queryClient.setQueriesData<InfiniteData<ConversationsPage>>({ queryKey: ['conversations', 'list'] }, (old) => {
    if (!old) return old
    let changed = false
    const pages = old.pages.map((page) => {
      const items = page.items.map((c) => {
        if (!sameConversation(c, conversation)) return c
        changed = true
        return { ...c, ...conversation }
      })
      return changed ? { ...page, items } : page
    })
    return changed ? { ...old, pages } : old
  })
}

/** `unread.changed` — whole-value replacement of the badge counts (never additive: "replace, do
 * not add", RealtimeUnreadChangedData's own doc comment). `notifications` stays null until Wave 4
 * publishes it; the bell keeps its own fetch (`queries/notifications.ts`) until then. */
export function applyUnreadChanged(
  queryClient: QueryClient,
  data: components['schemas']['RealtimeUnreadChangedData'],
): void {
  queryClient.setQueryData<ConversationsPage>(['conversations'], (old) =>
    old ? { ...old, meta: { ...old.meta, unread_count: data.chat } } : old,
  )
  if (data.notifications != null) {
    queryClient.setQueryData(['notifications-unread-count'], data.notifications)
  }
}

/** `notification.created` — reserved for Wave 4 (RealtimeNotificationCreatedData's doc comment);
 * harmless to wire up now since nothing emits it yet. "Fetch it, or refresh the bell." */
export function applyNotificationCreated(queryClient: QueryClient): void {
  queryClient.invalidateQueries({ queryKey: ['notifications-unread-count'] })
  queryClient.invalidateQueries({ queryKey: ['notifications'] })
  // A student's answer to a Create Applicant request reaches staff as a notification (contract
  // gate 12f), and the frame does not say what it is about, so the Clients page's waiting panel is
  // marked stale with the bell. It refetches only while that panel is on screen.
  queryClient.invalidateQueries({ queryKey: ['applicant-requests'] })
}

/** `resync` — the resume position is gone; refetch `/conversations` and the open thread over REST
 * (asyncapi.yaml), rather than trying to patch around a gap we can't see. */
export function applyResync(queryClient: QueryClient, viewingSubject: RealtimeThreadRef | null): void {
  queryClient.invalidateQueries({ queryKey: ['conversations'] })
  if (viewingSubject) queryClient.invalidateQueries({ queryKey: threadMessagesKey(viewingSubject) })
}
