import type { InfiniteData, QueryClient } from '@tanstack/react-query'
import type { components } from '@/api/schema'
import type { RealtimeThreadRef } from './frame'

type LeadMessage = components['schemas']['LeadMessage']
type Conversation = components['schemas']['Conversation']

interface MessagesPage {
  items: LeadMessage[]
  meta: { next_cursor?: string | null; total?: number | null }
}

interface ConversationsPage {
  items: Conversation[]
  meta: { next_cursor?: string | null; total: number; unread_count: number }
}

/** `['leads', id, 'messages']` or `['clients', id, 'messages']` — the same key `useLeadMessages` /
 * `useClientMessages` (queries/leads.ts, queries/clients.ts) already read and poll. */
export function threadMessagesKey(thread: RealtimeThreadRef): [string, string, string] {
  return [thread.type === 'lead' ? 'leads' : 'clients', thread.id, 'messages']
}

/**
 * `chat.message` — append the new message to the open thread's cached page, if it's cached at all
 * (nothing to patch when nobody has that thread open). De-duped by id: a message the CURRENT
 * console user just sent arrives back over the socket too (every recipient, including the sender's
 * other connections, gets the fan-out), and `useSendLeadMessage`/`useSendClientMessage` already
 * invalidate this key on their own success — without the check, a slow invalidate racing a fast
 * frame could show it twice for one render.
 */
export function applyChatMessage(queryClient: QueryClient, thread: RealtimeThreadRef, message: LeadMessage): void {
  const key = threadMessagesKey(thread)
  queryClient.setQueryData<MessagesPage>(key, (old) => {
    if (!old) return old
    if (old.items.some((m) => m.id === message.id)) return old
    return { ...old, items: [...old.items, message] }
  })
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
  queryClient.setQueryData<MessagesPage>(key, (old) => {
    if (!old) return old
    let changed = false
    const items = old.items.map((m) => {
      if (m.sender === side) return m
      if (new Date(m.created_at).getTime() > upToMs) return m
      const currentRank = STATUS_RANK[m.status ?? 'sent']
      if (currentRank >= STATUS_RANK[targetStatus]) return m
      changed = true
      return { ...m, status: targetStatus }
    })
    return changed ? { ...old, items } : old
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
}

/** `resync` — the resume position is gone; refetch `/conversations` and the open thread over REST
 * (asyncapi.yaml), rather than trying to patch around a gap we can't see. */
export function applyResync(queryClient: QueryClient, viewingSubject: RealtimeThreadRef | null): void {
  queryClient.invalidateQueries({ queryKey: ['conversations'] })
  if (viewingSubject) queryClient.invalidateQueries({ queryKey: threadMessagesKey(viewingSubject) })
}
