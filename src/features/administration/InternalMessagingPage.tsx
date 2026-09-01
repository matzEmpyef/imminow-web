import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { PictureInPicture2, Search } from 'lucide-react'
import { AppShell } from '@/features/auth/AppShell'
import { ChatPanel } from '@/components/ChatPanel'
import {
  useInternalConversationMessages,
  useInternalConversations,
  useMarkInternalConversationRead,
  useSendInternalMessage,
  useUnsendInternalMessage,
} from '@/queries/internalMessages'
import { useChatWindowStore } from '@/stores/chatWindowStore'
import { avatarTheme } from '@/lib/avatarTheme'
import { Skeleton } from '@/components/QueryState'
import { formatDate } from '@/lib/time'

const EMPTY_CONVERSATIONS: NonNullable<ReturnType<typeof useInternalConversations>['data']>['items'] = []

// Two-pane list+chat page, same role Lead Pool/Clients List plays for leads/clients on the list
// side — but the conversation itself renders inline here (not a floating popup): this is the
// dedicated place to actually have the conversation, not just a quick-access surface the way
// GlobalChatDrawer is (that still opens a floating window on click). Selecting a row navigates to
// /administration/internal-messaging/:id, which also doubles as FloatingChatWindow's "Open full
// conversation" target for internal chats, replacing the old standalone InternalConversationPage.
export function InternalMessagingPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [query, setQuery] = useState('')
  const [draft, setDraft] = useState('')
  const conversations = useInternalConversations()
  const messages = useInternalConversationMessages(id)
  const sendMessage = useSendInternalMessage(id)
  const unsendMessage = useUnsendInternalMessage(id)
  const markRead = useMarkInternalConversationRead()
  const openFloating = useChatWindowStore((s) => s.open)

  const items = conversations.data?.items ?? EMPTY_CONVERSATIONS
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return items
    return items.filter((c) => c.name.toLowerCase().includes(q))
  }, [items, query])

  const selected = items.find((c) => c.id === id)

  useEffect(() => {
    if (id) markRead.mutate(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mutate() is stable, id is the real trigger
  }, [id])

  function handleSend(e: FormEvent) {
    e.preventDefault()
    if (!draft.trim() || !id) return
    sendMessage.mutate(draft, { onSuccess: () => setDraft('') })
  }

  return (
    <AppShell>
      <div className="flex h-full min-h-0 flex-col gap-md">
        <div>
          <h1 className="text-h1 text-text-primary">Internal Messaging</h1>
          <p className="text-body-sm text-text-secondary">
            Chat with a colleague, or the whole Team — separate from client-facing chat.
          </p>
        </div>

        <div className="flex min-h-0 flex-1 gap-lg">
          <div className="flex w-80 shrink-0 flex-col gap-sm">
            <div className="relative">
              <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-text-secondary" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search colleagues…"
                aria-label="Search colleagues"
                className="h-11 w-full rounded-full border border-border bg-surface pl-11 pr-4 text-body text-text-primary outline-none focus:border-2 focus:border-primary"
              />
            </div>

            {conversations.isLoading && <Skeleton className="h-40 rounded-lg" />}

            {/* H10 fix (frontend review, 1 Sep 2026) — a failed fetch used to read as "No
                colleagues yet", indistinguishable from a genuinely empty roster. */}
            {conversations.isError && (
              <div className="flex flex-col items-start gap-xs">
                <p className="text-body-sm text-error">Could not load conversations.</p>
                <button
                  type="button"
                  onClick={() => conversations.refetch()}
                  className="text-body-sm text-primary hover:underline"
                >
                  Retry
                </button>
              </div>
            )}

            {!conversations.isLoading && !conversations.isError && filtered.length === 0 && (
              <p className="text-body-sm text-text-secondary">{query ? 'No matches.' : 'No colleagues yet.'}</p>
            )}

            {!conversations.isError && filtered.length > 0 && (
              <div className="min-h-0 flex-1 overflow-y-auto rounded-lg border border-border bg-surface">
                {filtered.map((conversation, i) => {
                  const theme = avatarTheme(`internal-${conversation.id}`)
                  const active = conversation.id === id
                  return (
                    <button
                      key={conversation.id}
                      onClick={() => navigate(`/administration/internal-messaging/${conversation.id}`)}
                      className={`flex w-full items-center gap-sm px-md py-sm text-left ${
                        active ? 'bg-primary-subtle' : 'hover:bg-background'
                      } ${i > 0 ? 'border-t border-border' : ''}`}
                    >
                      <span
                        className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-body-sm font-semibold ${theme.bg} ${theme.text}`}
                      >
                        {conversation.name.charAt(0).toUpperCase()}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-sm">
                          <div className="flex min-w-0 items-center gap-xs">
                            <p className="truncate text-body-sm font-semibold text-text-primary">{conversation.name}</p>
                            {conversation.badge && (
                              <span className="shrink-0 rounded-full bg-background px-xs py-0.5 text-caption font-medium text-text-secondary">
                                {conversation.badge}
                              </span>
                            )}
                          </div>
                          <div className="flex shrink-0 items-center gap-xs">
                            {conversation.unread && (
                              <span className="h-2 w-2 rounded-full bg-primary" aria-label="Unread" />
                            )}
                            {conversation.last_message_at && (
                              <span className="text-caption text-text-secondary">
                                {formatDate(conversation.last_message_at)}
                              </span>
                            )}
                          </div>
                        </div>
                        <p
                          className={`truncate text-caption ${conversation.unread ? 'font-medium text-text-primary' : 'text-text-secondary'}`}
                        >
                          {conversation.last_message_preview ?? 'No messages yet'}
                        </p>
                      </div>
                    </button>
                  )
                })}
              </div>
            )}
          </div>

          <div className="flex min-h-0 flex-1 flex-col">
            {!id && (
              <div className="flex h-full flex-col items-center justify-center gap-xs rounded-lg border border-border bg-surface text-center">
                <p className="text-body font-medium text-text-primary">Select a conversation</p>
                <p className="text-body-sm text-text-secondary">Pick a colleague or Whole Team to start chatting.</p>
              </div>
            )}

            {id && !selected && (
              <div className="flex h-full items-center justify-center rounded-lg border border-border bg-surface">
                <p className="text-body-sm text-text-secondary">
                  {conversations.isLoading ? 'Loading…' : 'Conversation not found.'}
                </p>
              </div>
            )}

            {id && selected && (
              <ChatPanel
                name={selected.name}
                typeLabel={selected.badge ?? selected.designation ?? 'Colleague'}
                messages={messages.data?.items?.map((m) => ({
                  ...m,
                  fromMe: m.from_me,
                  senderName: id === 'team' ? m.sender_name : undefined,
                }))}
                isLoading={messages.isLoading}
                isError={messages.isError}
                onRetryMessages={() => messages.refetch()}
                draft={draft}
                onDraftChange={setDraft}
                onSend={handleSend}
                sending={sendMessage.isPending}
                onUnsend={(messageId) => unsendMessage.mutateAsync(messageId)}
                heightClassName="h-full"
                headerActions={
                  <button
                    onClick={() =>
                      openFloating({ id: selected.id, type: 'internal', name: selected.name, badge: selected.badge })
                    }
                    aria-label="Open as floating window"
                    title="Open as floating window"
                    className="flex h-7 w-7 items-center justify-center rounded-md text-text-secondary hover:bg-background hover:text-text-primary"
                  >
                    <PictureInPicture2 className="h-4 w-4" />
                  </button>
                }
              />
            )}
          </div>
        </div>
      </div>
    </AppShell>
  )
}
