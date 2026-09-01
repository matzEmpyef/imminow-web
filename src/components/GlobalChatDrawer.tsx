import { useMemo, useState } from 'react'
import { MessageSquare } from 'lucide-react'
import { Drawer } from './Drawer'
import { TextField } from './TextField'
import { Button } from './Button'
import { useConversations } from '@/queries/conversations'
import { useChatWindowStore } from '@/stores/chatWindowStore'
import { relativeTime } from '@/lib/time'
import type { components } from '@/api/schema'

type Conversation = components['schemas']['Conversation']

// The client-side fallback when a row carries no explicit badge — "Aspirant" for a lead,
// "Applicant" for a client, "Colleague" for an internal DM without an Admin badge.
const TYPE_LABELS: Record<Conversation['type'], string> = {
  lead: 'Aspirant',
  client: 'Applicant',
  internal: 'Colleague',
}

// Global Chat Drawer — a chat icon in the shell header opening a slide-in list of every
// conversation the viewer can hold (leads + clients, plus Internal Messaging rows on Ultimate),
// clicking one opening the floating chat window without navigating. Removed 2026-08-19 on a
// misread instruction; RESTORED 2026-08-20 (user: "I want it. I don't think I asked you to
// remove it, I asked to not do a tab feature for Aspirants and Applicants") — so this is ONE
// merged list with per-row type pills, deliberately no Aspirant/Applicant tab split.
export function GlobalChatDrawer() {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const { data, isError, refetch } = useConversations(open)
  const openChatWindow = useChatWindowStore((s) => s.open)

  const unreadCount =
    data?.meta && 'unread_count' in data.meta ? ((data.meta as { unread_count?: number }).unread_count ?? 0) : 0

  const conversations = useMemo(() => {
    const items = data?.items ?? []
    const needle = query.trim().toLowerCase()
    if (!needle) return items
    return items.filter((c) => c.name.toLowerCase().includes(needle))
  }, [data, query])

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
          <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-error px-1 text-caption font-medium leading-none text-text-on-primary">
            {unreadCount}
          </span>
        )}
      </button>
      <Drawer
        open={open}
        onClose={() => setOpen(false)}
        title="Chats"
        stickyContent={
          <TextField label="Search conversations" value={query} onChange={(e) => setQuery(e.target.value)} />
        }
      >
        {isError ? (
          // H10 fix (frontend review, 1 Sep 2026): a failed fetch used to render as "No
          // conversations found" — indistinguishable from actually having none.
          <div className="flex flex-col items-center gap-sm py-lg text-center">
            <p className="text-body-sm text-error">Could not load conversations.</p>
            <Button variant="secondary" size="sm" onClick={() => refetch()}>
              Retry
            </Button>
          </div>
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
                        {conversation.badge ?? TYPE_LABELS[conversation.type]}
                      </span>
                    </div>
                    <p className="truncate text-caption text-text-secondary">
                      {conversation.last_message_preview ?? 'No messages yet'}
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1">
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
      </Drawer>
    </>
  )
}
