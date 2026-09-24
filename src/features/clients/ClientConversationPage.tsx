import { useEffect, useState, type FormEvent } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, PictureInPicture2 } from 'lucide-react'
import { AppShell } from '@/features/auth/AppShell'
import { ChatPanel } from '@/components/ChatPanel'
import { SuggestCourseInChat } from './SuggestCourseInChat'
import { ErrorState, Skeleton } from '@/components/QueryState'
import { useClient, useClientMessages, useMarkClientRead, useSendClientMessage } from '@/queries/clients'
import { useChatWindowStore } from '@/stores/chatWindowStore'
import { duplicateShareMessage } from './shareGuards'
import { CASE_MOVED_COMPOSER_NOTE, isCaseMoved } from '@/lib/clientStatus'

export function ClientConversationPage() {
  const { id = '' } = useParams()
  const client = useClient(id)
  const messages = useClientMessages(id)
  const sendMessage = useSendClientMessage(id)
  const { mutate: markRead } = useMarkClientRead()
  const openFloating = useChatWindowStore((s) => s.open)
  const [draft, setDraft] = useState('')
  // One line above the composer for anything that failed to send (chat UX, product owner
  // 2026-09-19) — an ordinary message, or the server's 409 `duplicate_share` on a course share.
  // Cleared the moment the consultant types again, never by a retry.
  const [composerError, setComposerError] = useState<string | null>(null)

  // `mutate` is destructured because it is referentially stable in React Query v5, so it can be
  // a real dependency: the rule is satisfied and `id` stays the only trigger (B5, 2026-09-03).
  useEffect(() => {
    if (id) markRead(id)
  }, [id, markRead])

  function handleSend(e: FormEvent) {
    e.preventDefault()
    if (!draft.trim()) return
    setComposerError(null)
    // The draft is cleared on SUCCESS only — a refused send leaves what was typed in place.
    sendMessage.mutate(draft, {
      onSuccess: () => setDraft(''),
      onError: (error) => setComposerError(duplicateShareMessage(error)),
    })
  }

  if (client.isLoading) {
    return (
      <AppShell>
        <Skeleton className="h-64 rounded-lg" />
      </AppShell>
    )
  }

  if (client.isError || !client.data) {
    return (
      <AppShell>
        <ErrorState message="Could not load this client." onRetry={() => client.refetch()} />
      </AppShell>
    )
  }

  return (
    <AppShell>
      <div className="flex h-full min-h-0 flex-col gap-md">
        <div className="flex min-w-0 shrink-0 items-center gap-sm">
          <Link
            to={`/clients/${id}`}
            aria-label="Back to Profile"
            title="Back to Profile"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-text-secondary hover:bg-background hover:text-text-primary"
          >
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <h1 className="truncate text-h1 text-text-primary">
            {client.data.student.first_name} {client.data.student.last_name}
          </h1>
        </div>
        <ChatPanel
          name={`${client.data.student.first_name} ${client.data.student.last_name}`}
          typeLabel="Applicant"
          messages={messages.data?.items?.map((m) => ({
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
          }))}
          isLoading={messages.isLoading}
          isError={messages.isError}
          onRetryMessages={() => messages.refetch()}
          draft={draft}
          onDraftChange={(value) => {
            setDraft(value)
            if (composerError) setComposerError(null)
          }}
          composerError={composerError}
          onSend={handleSend}
          sending={sendMessage.isPending}
          heightClassName="h-full"
          person={{ id, kind: 'client' }}
          // Case moved to another consultancy (product owner 2026-09-24) — the server 409s
          // `case_moved` on a send here, same idiom Lead Pool's unallocated-lead lock already
          // uses for `composerLocked`: say why up front rather than let the send fail.
          composerLocked={isCaseMoved(client.data.status) ? CASE_MOVED_COMPOSER_NOTE : undefined}
          composerAction={
            // Courses only mean something on a study case; a PR case has no Applications tab.
            client.data.case_type === 'student' ? (
              <SuggestCourseInChat
                person={{ id, kind: 'client', firstName: client.data.student.first_name, hasApp: true }}
                onShareError={setComposerError}
              />
            ) : undefined
          }
          headerActions={
            <button
              onClick={() =>
                openFloating({
                  id,
                  type: 'client',
                  name: `${client.data.student.first_name} ${client.data.student.last_name}`,
                })
              }
              aria-label="Open as floating window"
              title="Open as floating window"
              className="flex h-7 w-7 items-center justify-center rounded-md text-text-secondary hover:bg-background hover:text-text-primary"
            >
              <PictureInPicture2 className="h-4 w-4" />
            </button>
          }
        />
      </div>
    </AppShell>
  )
}
