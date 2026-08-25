import { useEffect, useState, type FormEvent } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, PictureInPicture2 } from 'lucide-react'
import { AppShell } from '@/features/auth/AppShell'
import { ChatPanel } from '@/components/ChatPanel'
import { ErrorState, Skeleton } from '@/components/QueryState'
import { useClient, useClientMessages, useMarkClientRead, useSendClientMessage } from '@/queries/clients'
import { useChatWindowStore } from '@/stores/chatWindowStore'

export function ClientConversationPage() {
  const { id = '' } = useParams()
  const client = useClient(id)
  const messages = useClientMessages(id)
  const sendMessage = useSendClientMessage(id)
  const markRead = useMarkClientRead()
  const openFloating = useChatWindowStore((s) => s.open)
  const [draft, setDraft] = useState('')

  useEffect(() => {
    if (id) markRead.mutate(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mutate() is stable, id is the real trigger
  }, [id])

  function handleSend(e: FormEvent) {
    e.preventDefault()
    if (!draft.trim()) return
    sendMessage.mutate(draft, { onSuccess: () => setDraft('') })
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
            isSessionBreak: m.type === 'session_break',
          }))}
          isLoading={messages.isLoading}
          draft={draft}
          onDraftChange={setDraft}
          onSend={handleSend}
          sending={sendMessage.isPending}
          heightClassName="h-full"
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
