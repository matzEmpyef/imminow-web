import { useState } from 'react'
import { Download } from 'lucide-react'
import { Badge } from '@/components/Badge'
import { Button } from '@/components/Button'
import { Modal } from '@/components/Modal'
import { ErrorState, Skeleton } from '@/components/QueryState'
import { TextAreaField } from '@/components/TextAreaField'
import { countOf } from '@/lib/counts'
import { formatDate, formatDateTime } from '@/lib/time'
import {
  conversationExportErrorMessage,
  isPreparing,
  useConversationExport,
  useDownloadConversationExport,
  useRequestConversationExport,
  useStudentConversationExports,
  useStudentConversations,
  type ConversationExport,
  type StudentConversation,
} from '@/queries/conversationExports'

const REASON_MIN = 3
const REASON_MAX = 500

type Ready = { id: string; url: string; minutes: number }

function exportState(item: ConversationExport): { label: string; color: 'info' | 'success' | 'secondary' | 'error'; note: string } {
  if (isPreparing(item)) return { label: 'Preparing…', color: 'info', note: 'This takes a moment.' }
  if (item.status === 'failed') return { label: 'Not prepared', color: 'error', note: 'It could not be prepared. Ask again.' }
  return item.downloadable
    ? {
        label: 'Ready',
        color: 'success',
        note: item.ready_until ? `Available until ${formatDateTime(item.ready_until)}` : 'Ready to download.',
      }
    : { label: 'No longer available', color: 'secondary', note: 'Its download period has ended. Ask again for a new one.' }
}

/**
 * Export a student's whole conversation with one consultancy as a PDF (owner ruling 2026-10-06;
 * decisions 60 and 61). Opened from Sentpo Users and from the Dispute and Complaint drawers, by
 * platform staff holding `support` and by Super Admins — the callers show the way in only to them
 * (`useCanExportConversations`).
 *
 * Pick the consultancy, give a reason (kept on the record), ask. The transcript is prepared in
 * the background, so the dialog then follows it: "Preparing…", then Download. The link behind
 * Download works for five minutes, so it is asked for at the click. Below, every recent export
 * of this student's conversations, whoever asked: a colleague's file can be downloaded here too.
 */
export function ConversationExportModal({
  student,
  consultancyId,
  onClose,
}: {
  student: { id: string; name: string | null }
  /** The consultancy to start on: the one the dispute or complaint is about. */
  consultancyId?: string | null
  onClose: () => void
}) {
  const conversations = useStudentConversations(student.id)
  const recent = useStudentConversationExports(student.id)
  const request = useRequestConversationExport(student.id)
  const download = useDownloadConversationExport(student.id)

  // What the operator picked. Until they pick, the dialog starts on the consultancy it was opened
  // for, or on the only one there is.
  const [picked, setPicked] = useState<string | null>(null)
  const [reason, setReason] = useState('')
  const [attempted, setAttempted] = useState(false)
  // The export asked for from this dialog, followed until it is ready or has failed.
  const [requested, setRequested] = useState<ConversationExport | null>(null)
  const following = useConversationExport(requested)
  const [ready, setReady] = useState<Ready | null>(null)
  const [failedId, setFailedId] = useState<string | null>(null)

  const rows = conversations.data?.items ?? []
  const preselected = rows.find((row) => row.consultancy_id === consultancyId)?.consultancy_id
  const selected = picked ?? preselected ?? (rows.length === 1 ? rows[0].consultancy_id : '')

  const trimmed = reason.trim()
  const reasonError =
    attempted && trimmed.length < REASON_MIN ? `Give a reason of at least ${REASON_MIN} characters.` : undefined
  const consultancyError = attempted && !selected ? 'Choose the consultancy.' : undefined

  function handleRequest() {
    if (!selected || trimmed.length < REASON_MIN) {
      setAttempted(true)
      return
    }
    request.mutate({ consultancy_id: selected, reason: trimmed }, { onSuccess: (created) => setRequested(created) })
  }

  function startDownload(id: string) {
    setFailedId(null)
    setReady(null)
    download.mutate(id, {
      onSuccess: ({ url, expires_in_seconds }) => {
        // The link works for a few minutes only, so it is opened at once. A browser may stop a
        // page from opening a tab by itself, so the same link is also left on the row to click.
        setReady({ id, url, minutes: Math.max(1, Math.round(expires_in_seconds / 60)) })
        const anchor = document.createElement('a')
        anchor.href = url
        anchor.target = '_blank'
        anchor.rel = 'noopener noreferrer'
        anchor.click()
      },
      onError: () => setFailedId(id),
    })
  }

  // One export's Download button and what came of pressing it; the same on both lists.
  function downloadControls(item: ConversationExport) {
    return {
      button: item.downloadable && (
        <Button
          size="sm"
          loading={download.isPending && download.variables === item.id}
          onClick={() => startDownload(item.id)}
          className="shrink-0"
        >
          <span className="inline-flex items-center gap-xs">
            <Download className="h-3.5 w-3.5" aria-hidden />
            Download
          </span>
        </Button>
      ),
      outcome: (
        <>
          {ready?.id === item.id && (
            <p className="text-caption text-text-secondary">
              Your download has started. If it did not,{' '}
              <a href={ready.url} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                open the download link
              </a>
              . It works for {ready.minutes} {ready.minutes === 1 ? 'minute' : 'minutes'}.
            </p>
          )}
          {failedId === item.id && download.isError && (
            <p role="alert" className="text-caption text-error">
              {conversationExportErrorMessage(download.error)}
            </p>
          )}
        </>
      ),
    }
  }

  const current = following.data
  const currentControls = current ? downloadControls(current) : null
  // Everything else on the list; the one being followed is shown above it.
  const others = (recent.data?.items ?? []).filter((item) => item.id !== current?.id)

  return (
    <Modal
      onClose={onClose}
      title={`Export conversation — ${student.name ?? 'student'}`}
      widthRem={36}
      footer={
        current ? (
          <Button variant="secondary" onClick={onClose}>
            Close
          </Button>
        ) : (
          <>
            {request.isError && (
              <p role="alert" className="mr-auto self-center text-body-sm text-error">
                {request.error.message}
              </p>
            )}
            <Button variant="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button loading={request.isPending} disabled={rows.length === 0} onClick={handleRequest}>
              Request
            </Button>
          </>
        )
      }
    >
      <div className="flex flex-col gap-lg">
        {current && currentControls ? (
          <div role="status" className="flex flex-col gap-sm rounded-md border border-border p-md">
            <div className="flex flex-wrap items-center justify-between gap-sm">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-sm">
                  <p className="text-body-sm font-medium text-text-primary">{current.consultancy_name ?? 'Consultancy'}</p>
                  {following.isError ? (
                    <Badge color="secondary">Not available</Badge>
                  ) : (
                    <Badge color={exportState(current).color}>{exportState(current).label}</Badge>
                  )}
                </div>
                <p className="text-caption text-text-secondary">
                  {following.isError ? conversationExportErrorMessage(following.error) : exportState(current).note}
                </p>
              </div>
              {!following.isError && currentControls.button}
            </div>
            {currentControls.outcome}
            {(!isPreparing(current) || following.isError) && (
              <div>
                <button
                  type="button"
                  className="text-caption font-medium text-primary hover:underline"
                  onClick={() => {
                    setRequested(null)
                    request.reset()
                  }}
                >
                  {current.status === 'failed' || following.isError ? 'Ask again' : 'Export another conversation'}
                </button>
              </div>
            )}
          </div>
        ) : (
          <div className="flex flex-col gap-md">
            <p className="text-body-sm text-text-secondary">
              Prepares the whole conversation between this student and one consultancy as a PDF. It can be downloaded
              here for 24 hours.
            </p>

            {conversations.isLoading ? (
              <Skeleton className="h-24 rounded-md" />
            ) : conversations.isError ? (
              <ErrorState
                message={conversations.error.message}
                onRetry={() => void conversations.refetch()}
                error={conversations.error}
              />
            ) : rows.length === 0 ? (
              <p className="rounded-md bg-background p-md text-body-sm text-text-secondary">
                This student has no conversation with a consultancy yet.
              </p>
            ) : (
              <fieldset className="flex flex-col gap-xs">
                <legend className="pb-xs text-body-sm font-medium text-text-primary">Consultancy</legend>
                <div className="flex max-h-56 flex-col gap-xs overflow-y-auto">
                  {rows.map((row) => (
                    <ConversationOption
                      key={row.consultancy_id}
                      row={row}
                      checked={selected === row.consultancy_id}
                      onPick={() => setPicked(row.consultancy_id)}
                    />
                  ))}
                </div>
                {consultancyError && <p className="text-caption text-error">{consultancyError}</p>}
              </fieldset>
            )}

            <div className="flex flex-col gap-xs">
              <TextAreaField
                label="Reason"
                required
                rows={2}
                maxLength={REASON_MAX}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                error={reasonError}
              />
              {/* Always visible, not a hint: a hint gives way to an error message, and this must not. */}
              <p className="pl-lg text-caption text-text-secondary">Your reason is kept on the record with your name.</p>
            </div>
          </div>
        )}

        <div className="flex flex-col">
          <p className="pb-xs text-body-sm font-medium text-text-primary">Recent exports for this student</p>
          {recent.isLoading && <Skeleton className="h-12 rounded-md" />}
          {recent.isError && (
            <p className="py-sm text-body-sm text-error">
              {recent.error.message}{' '}
              <button type="button" className="underline" onClick={() => void recent.refetch()}>
                Retry
              </button>
            </p>
          )}
          {!recent.isLoading && !recent.isError && others.length === 0 && (
            <p className="py-sm text-body-sm text-text-secondary">
              {current ? 'No other exports yet.' : 'No exports yet.'}
            </p>
          )}
          {others.map((item) => {
            const state = exportState(item)
            const controls = downloadControls(item)
            return (
              <div key={item.id} className="flex flex-wrap items-center gap-md border-t border-border py-sm">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-sm">
                    <p className="text-body-sm font-medium text-text-primary">{item.consultancy_name ?? 'Consultancy'}</p>
                    <Badge color={state.color}>{state.label}</Badge>
                  </div>
                  <p className="text-caption text-text-secondary">
                    Asked by {item.requested_by_name ?? 'a colleague'} · {formatDateTime(item.requested_at)}
                  </p>
                  <p className="text-caption text-text-secondary">{state.note}</p>
                  {controls.outcome}
                </div>
                {controls.button}
              </div>
            )
          })}
          {recent.data?.meta.next_cursor && (
            <p className="border-t border-border pt-sm text-caption text-text-secondary">Showing the most recent exports.</p>
          )}
        </div>
      </div>
    </Modal>
  )
}

function ConversationOption({ row, checked, onPick }: { row: StudentConversation; checked: boolean; onPick: () => void }) {
  return (
    <label
      className={`flex cursor-pointer items-start gap-sm rounded-md border px-3 py-sm ${
        checked ? 'border-primary bg-primary/5' : 'border-border'
      }`}
    >
      <input
        type="radio"
        name="conversation-export-consultancy"
        checked={checked}
        onChange={onPick}
        className="mt-0.5 h-4 w-4 accent-primary"
      />
      <span className="min-w-0 text-body-sm font-medium text-text-primary">
        {row.consultancy_name ?? 'Consultancy'}
        <span className="block text-caption font-normal text-text-secondary">
          {countOf(row.message_count, false, 'message')}
          {row.last_message_at ? ` · last message ${formatDate(row.last_message_at)}` : ''}
        </span>
      </span>
    </label>
  )
}
