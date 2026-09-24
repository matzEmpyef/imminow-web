import { useEffect, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { ExternalLink, Minus, X } from 'lucide-react'
import { ChatPanel } from './ChatPanel'
import { useChatWindowStore } from '@/stores/chatWindowStore'
import { useLead, useLeadMessages, useMarkLeadRead, useSendLeadMessage } from '@/queries/leads'
import { useClient, useClientMessages, useMarkClientRead, useSendClientMessage } from '@/queries/clients'
import { SuggestCourseInChat, type ChatPerson } from '@/features/clients/SuggestCourseInChat'
import { duplicateShareMessage } from '@/features/clients/shareGuards'
import {
  useInternalConversationMessages,
  useMarkInternalConversationRead,
  useSendInternalMessage,
  useUnsendInternalMessage,
} from '@/queries/internalMessages'
import { CHAT_TYPE_LABELS } from './chatTypeLabels'

// Facebook-style floating chat popup — opened from the conversation pages' pop-out buttons and
// stays available while browsing the rest of the app. One window at a time (see
// chatWindowStore.ts). Lives at the AppShell root so it floats over whatever page is showing;
// it re-mounts on route changes (AppShell itself isn't a persistent layout wrapper in this app's
// routing), but react-query's cache means that's just a re-render, not a re-fetch.
export function FloatingChatWindow() {
  const { conversation, minimized, close, toggleMinimize } = useChatWindowStore()
  const navigate = useNavigate()
  const [draft, setDraft] = useState('')
  // Same one-line send error as the full conversation pages (chat UX, product owner 2026-09-19).
  const [composerError, setComposerError] = useState<string | null>(null)

  const rightOffset = '1.5rem'

  const isLead = conversation?.type === 'lead'
  const isClient = conversation?.type === 'client'
  const isInternal = conversation?.type === 'internal'
  const leadId = isLead ? conversation.id : undefined
  const clientId = isClient ? conversation.id : undefined
  const internalId = isInternal ? conversation.id : undefined

  const leadMessages = useLeadMessages(leadId)
  // Only to know whether the lead is still in the pool; no one replies to it until it is allocated.
  const lead = useLead(leadId)
  const clientMessages = useClientMessages(clientId)
  // Only for Suggest a course: whether this is a study case, and the student's first name.
  const client = useClient(clientId ?? '')
  const internalMessages = useInternalConversationMessages(internalId)
  const sendLeadMessage = useSendLeadMessage(leadId ?? '')
  const sendClientMessage = useSendClientMessage(clientId ?? '')
  const sendInternalMessage = useSendInternalMessage(internalId)
  const unsendInternalMessage = useUnsendInternalMessage(internalId)
  const { mutate: markLeadRead } = useMarkLeadRead()
  const { mutate: markClientRead } = useMarkClientRead()
  const { mutate: markInternalRead } = useMarkInternalConversationRead()
  // Scalars, so the effect below keys on the conversation's identity rather than the object —
  // and the three `mutate`s are stable in React Query v5, so all five are real deps (B5, 2026-09-03).
  const conversationId = conversation?.id
  const conversationType = conversation?.type

  useEffect(() => {
    if (!conversationId) return
    if (conversationType === 'lead') markLeadRead(conversationId)
    else if (conversationType === 'client') markClientRead(conversationId)
    else markInternalRead(conversationId)
  }, [conversationId, conversationType, markLeadRead, markClientRead, markInternalRead])

  if (!conversation) return null

  const messages = isLead
    ? leadMessages.data?.items?.map((m) => ({
        ...m,
        fromMe: m.sender === 'consultant',
        sharedCourses: m.shared_courses,
        sharedCollege: m.shared_college,
        sharedCourse: m.shared_course,
        fitSummary: m.fit_summary,
        visitRequest: m.visit_request,
        sharedSearch: m.shared_search,
        isSessionBreak: m.type === 'session_break',
        isCallInitiated: m.type === 'call_initiated',
      }))
    : isClient
      ? clientMessages.data?.items?.map((m) => ({
          ...m,
          fromMe: m.sender === 'consultant',
          sharedCourses: m.shared_courses,
          sharedCollege: m.shared_college,
          sharedCourse: m.shared_course,
          fitSummary: m.fit_summary,
          visitRequest: m.visit_request,
          sharedSearch: m.shared_search,
          isSessionBreak: m.type === 'session_break',
          isCallInitiated: m.type === 'call_initiated',
        }))
      : internalMessages.data?.items?.map((m) => ({
          ...m,
          fromMe: m.from_me,
          senderName: conversation.id === 'team' ? m.sender_name : undefined,
        }))
  const isLoading = isLead ? leadMessages.isLoading : isClient ? clientMessages.isLoading : internalMessages.isLoading
  const activeMessagesQuery = isLead ? leadMessages : isClient ? clientMessages : internalMessages
  const isError = activeMessagesQuery.isError
  const sending = isLead
    ? sendLeadMessage.isPending
    : isClient
      ? sendClientMessage.isPending
      : sendInternalMessage.isPending
  const fullPath = isLead
    ? `/sales/leads/${conversation.id}`
    : isClient
      ? `/clients/${conversation.id}/conversation`
      : `/administration/internal-messaging/${conversation.id}`

  const chatPerson: ChatPerson | null =
    isLead && lead.data
      ? {
          id: conversation.id,
          kind: 'lead',
          firstName: conversation.name,
          hasApp: lead.data.origin === 'sentpo' && Boolean(lead.data.student_id),
        }
      : isClient && client.data?.case_type === 'student'
        ? { id: conversation.id, kind: 'client', firstName: client.data.student.first_name, hasApp: true }
        : null

  function handleSend(e: FormEvent) {
    e.preventDefault()
    if (!draft.trim()) return
    const mutation = isLead ? sendLeadMessage : isClient ? sendClientMessage : sendInternalMessage
    setComposerError(null)
    mutation.mutate(draft, {
      onSuccess: () => setDraft(''),
      onError: (error: Error) => setComposerError(duplicateShareMessage(error)),
    })
  }

  function openFullConversation() {
    close()
    navigate(fullPath)
  }

  if (minimized) {
    return (
      <button
        onClick={toggleMinimize}
        style={{ maxWidth: '18rem', right: rightOffset }}
        className="fixed bottom-lg z-50 flex w-72 items-center justify-between rounded-lg border border-border bg-surface px-md py-sm shadow-card hover:bg-background"
      >
        <span className="truncate text-body-sm font-medium text-text-primary">{conversation.name}</span>
        <X
          className="h-4 w-4 shrink-0 text-text-secondary hover:text-text-primary"
          onClick={(e) => {
            e.stopPropagation()
            close()
          }}
        />
      </button>
    )
  }

  return (
    <div style={{ maxWidth: '22rem', right: rightOffset }} className="fixed bottom-lg z-50 w-80">
      <ChatPanel
        name={conversation.name}
        typeLabel={conversation.badge ?? CHAT_TYPE_LABELS[conversation.type]}
        typeLabelTone={isLead ? 'primary' : 'neutral'}
        messages={messages}
        isLoading={isLoading}
        isError={isError}
        onRetryMessages={() => activeMessagesQuery.refetch()}
        draft={draft}
        onDraftChange={(value) => {
          setDraft(value)
          if (composerError) setComposerError(null)
        }}
        onSend={handleSend}
        composerLocked={
          isLead && lead.data && !lead.data.assigned_employee_id
            ? 'Allocate this lead to a consultant from Lead Pool to reply.'
            : undefined
        }
        sending={sending}
        person={isLead || isClient ? { id: conversation.id, kind: isLead ? 'lead' : 'client' } : undefined}
        composerError={composerError}
        composerAction={
          chatPerson ? <SuggestCourseInChat person={chatPerson} onShareError={setComposerError} /> : undefined
        }
        onUnsend={isInternal ? (messageId) => unsendInternalMessage.mutateAsync(messageId) : undefined}
        className="shadow-lg"
        headerActions={
          <>
            <button
              onClick={openFullConversation}
              aria-label="Open full conversation"
              title="Open full conversation"
              className="flex h-7 w-7 items-center justify-center rounded-md text-text-secondary hover:bg-background hover:text-text-primary"
            >
              <ExternalLink className="h-4 w-4" />
            </button>
            <button
              onClick={toggleMinimize}
              aria-label="Minimize"
              title="Minimize"
              className="flex h-7 w-7 items-center justify-center rounded-md text-text-secondary hover:bg-background hover:text-text-primary"
            >
              <Minus className="h-4 w-4" />
            </button>
            <button
              onClick={close}
              aria-label="Close"
              title="Close"
              className="flex h-7 w-7 items-center justify-center rounded-md text-text-secondary hover:bg-background hover:text-text-primary"
            >
              <X className="h-4 w-4" />
            </button>
          </>
        }
      />
    </div>
  )
}
