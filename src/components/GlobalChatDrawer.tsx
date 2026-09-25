import { useEffect, useMemo, useState, type UIEvent } from 'react'
import { MessageSquare } from 'lucide-react'
import { Drawer } from './Drawer'
import { TextField } from './TextField'
import { Button } from './Button'
import { useConversations, useConversationsList } from '@/queries/conversations'
import { useChatWindowStore } from '@/stores/chatWindowStore'
import { useDebouncedValue } from '@/lib/useDebounce'
import { relativeTime } from '@/lib/time'
import type { components } from '@/api/schema'
import { CHAT_TYPE_LABELS } from './chatTypeLabels'

type Conversation = components['schemas']['Conversation']

// How close to the bottom (px) triggers loading the next page.
const LOAD_MORE_THRESHOLD_PX = 120

// Global Chat Drawer — a chat icon in the shell header opening a slide-in list of every
// conversation the viewer can hold (leads + clients, plus Internal Messaging rows on Ultimate),
// clicking one opening the floating chat window without navigating. Removed 2026-08-19 on a
// misread instruction; RESTORED 2026-08-20 (user: "I want it. I don't think I asked you to
// remove it, I asked to not do a tab feature for Aspirants and Applicants") — so this is ONE
// merged list with per-row type pills, deliberately no Aspirant/Applicant tab split.
//
// Paged with server-side search since contract gate 7 (owner Q6, 2026-09-25): pages of 20, more
// loaded as the drawer scrolls toward the bottom, search box narrowed server-side instead of
// filtering a fully-loaded list. The header badge is untouched — Q6 says so explicitly — and
// still reads `useConversations`, the original unpaged/poll-while-open hook, unchanged.
export function GlobalChatDrawer() {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const debouncedQuery = useDebouncedValue(query, 300)
  const badge = useConversations(open)
  const list = useConversationsList(debouncedQuery, { enabled: open })
  const openChatWindow = useChatWindowStore((s) => s.open)

  const unreadCount =
    badge.data?.meta && 'unread_count' in badge.data.meta
      ? ((badge.data.meta as { unread_count?: number }).unread_count ?? 0)
      : 0

  const conversations = useMemo(() => list.data?.pages.flatMap((page) => page.items) ?? [], [list.data])

  // A fresh search (or reopening the drawer) starts over — the accumulated pages belong to the
  // PREVIOUS search term otherwise, and useInfiniteQuery's own cache keeps them around under the
  // old query key rather than clearing them for us.
  useEffect(() => {
    if (open) list.refetch()
    // eslint-disable-next-line react-hooks/exhaustive-deps -- refetch identity is stable; only re-run on open/search
  }, [open, debouncedQuery])

  function handleScroll(e: UIEvent<HTMLDivElement>) {
    const el = e.currentTarget
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < LOAD_MORE_THRESHOLD_PX
    if (nearBottom && list.hasNextPage && !list.isFetchingNextPage) list.fetchNextPage()
  }

  const openConversation = (conversation: Conversation) => {
    openChatWindow({
      id: conversation.id,
      type: conversation.type,
      name: conversation.name,
      badge: conversation.badge ?? null,
    })
    setOpen(false)
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        aria-label="Chats"
        className="relative flex h-8 w-8 items-center justify-center rounded-md text-text-secondary hover:bg-background hover:text-text-primary"
      >
        <MessageSquare className="h-5 w-5" />
        {unreadCount > 0 && (
          <span className="absolute -right-1 -top-xs flex h-4 min-w-4 items-center justify-center rounded-full bg-error px-xs text-caption font-medium leading-none text-text-on-primary">
            {unreadCount}
          </span>
        )}
      </button>
      <Drawer
        open={open}
        onClose={() => setOpen(false)}
        title="Chats"
        // A list of conversations to open; its search box only filters, so closing loses nothing.
        dismissible
        onScroll={handleScroll}
        stickyContent={
          <TextField label="Search conversations" value={query} onChange={(e) => setQuery(e.target.value)} />
        }
      >
        {list.isError ? (
          // H10 fix (frontend review, 1 Sep 2026): a failed fetch used to render as "No
          // conversations found" — indistinguishable from actually having none.
          <div className="flex flex-col items-center gap-sm py-lg text-center">
            <p className="text-body-sm text-error">Could not load conversations.</p>
            <Button variant="secondary" size="sm" onClick={() => list.refetch()}>
              Retry
            </Button>
          </div>
        ) : list.isLoading ? (
          // N4 (second pass): before the mount fetch lands, "No conversations found." was a claim
          // nobody had checked yet.
          <p className="py-lg text-center text-body-sm text-text-secondary">Loading…</p>
        ) : conversations.length === 0 ? (
          <p className="py-lg text-center text-body-sm text-text-secondary">No conversations found.</p>
        ) : (
          <ul className="divide-y divide-border">
            {conversations.map((conversation) => (
              <li key={`${conversation.type}-${conversation.id}`}>
                <button
                  onClick={() => openConversation(conversation)}
                  className="flex w-full items-start gap-sm px-xs py-sm text-left hover:bg-background"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-sm">
                      <span className="truncate text-body-sm font-semibold text-text-primary">{conversation.name}</span>
                      <span className="shrink-0 rounded-full bg-background px-sm py-0.5 text-caption text-text-secondary">
                        {conversation.badge ?? CHAT_TYPE_LABELS[conversation.type]}
                      </span>
                    </div>
                    <p className="truncate text-caption text-text-secondary">
                      {conversation.last_message_preview ?? 'No messages yet'}
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-xs">
                    {conversation.last_message_at && (
                      <span className="text-caption text-text-secondary">
                        {relativeTime(conversation.last_message_at)}
                      </span>
                    )}
                    {conversation.unread && <span className="h-2 w-2 rounded-full bg-primary" />}
                  </div>
                </button>
              </li>
            ))}
          </ul>
        )}
        {list.isFetchingNextPage && (
          <p className="py-sm text-center text-caption text-text-secondary">Loading more…</p>
        )}
      </Drawer>
    </>
  )
}
