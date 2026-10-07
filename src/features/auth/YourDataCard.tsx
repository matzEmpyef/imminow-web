import { useState } from 'react'
import { Download } from 'lucide-react'
import { ApiError } from '@/api/errors'
import { Badge } from '@/components/Badge'
import { Button } from '@/components/Button'
import { Card } from '@/components/Card'
import { humaniseCode } from '@/lib/humanise'
import { formatDate, formatDateTime } from '@/lib/time'
import { useDownloadMyExport, useMyExports, useRequestMyExport, type ExportRequest } from '@/queries/dataExports'

type Ready = { id: string; url: string; minutes: number }

function exportState(item: ExportRequest): { label: string; color: 'info' | 'success' | 'secondary' | 'error'; note: string } {
  if (item.status === 'queued' || item.status === 'processing') {
    return { label: 'Being prepared', color: 'info', note: 'We will email you when it is ready.' }
  }
  if (item.status === 'failed') {
    return { label: 'Not completed', color: 'error', note: 'This copy could not be prepared. Request a new one.' }
  }
  if (item.status === 'completed') {
    return item.downloadable
      ? {
          label: 'Ready',
          color: 'success',
          note: item.ready_until ? `Download it by ${formatDate(item.ready_until)}.` : 'Ready to download.',
        }
      : { label: 'No longer available', color: 'secondary', note: 'The download period has ended. Request a new copy.' }
  }
  return { label: humaniseCode(item.status), color: 'secondary', note: '' }
}

/**
 * "Your data" on My Account (gate 12f): ask for a copy of everything immiNow holds about you, and
 * download it here once it is ready. The copy never travels by email — the mail only says it is
 * ready — so this list is where it is collected, within 7 days.
 *
 * Every role uses this page, so every role gets this card. There is no "Delete my account" in the
 * console: a console account is erased through Support.
 */
export function YourDataCard() {
  const exports = useMyExports()
  const request = useRequestMyExport()
  const download = useDownloadMyExport()
  const [ready, setReady] = useState<Ready | null>(null)
  const [failedId, setFailedId] = useState<string | null>(null)

  const items = exports.data?.items ?? []
  const inProgress = items.some((item) => item.status === 'queued' || item.status === 'processing')
  const requestError = request.error
  const availableAt =
    requestError instanceof ApiError &&
    requestError.code === 'export_on_hold' &&
    typeof requestError.details?.available_at === 'string'
      ? requestError.details.available_at
      : null

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

  return (
    <Card>
      <div className="flex flex-wrap items-start justify-between gap-md">
        <div className="min-w-0 flex-1">
          <h2 className="text-h3 text-text-primary">Your data</h2>
          <p className="text-caption text-text-secondary">
            Request a copy of everything immiNow holds about you. We email you when it is ready, and you download it
            here within 7 days.
          </p>
        </div>
        <Button
          variant="secondary"
          size="sm"
          loading={request.isPending}
          disabled={inProgress}
          onClick={() => request.mutate()}
        >
          Request a copy
        </Button>
      </div>

      {inProgress && !request.isSuccess && (
        <p className="mt-sm text-caption text-text-secondary">A copy is already being prepared.</p>
      )}
      {request.isSuccess && (
        <p role="status" className="mt-sm text-body-sm text-success">
          Your copy is being prepared.{' '}
          {request.data?.delivery_email
            ? `We will email ${request.data.delivery_email} when it is ready.`
            : 'We will email you when it is ready.'}
        </p>
      )}
      {request.isError && (
        <div role="alert" className="mt-sm flex flex-col gap-0.5">
          <p className="text-body-sm text-error">{request.error.message}</p>
          {availableAt && (
            <p className="text-caption text-text-secondary">You can request a copy from {formatDateTime(availableAt)}.</p>
          )}
        </div>
      )}

      <div className="mt-md flex flex-col">
        {exports.isLoading && <p className="py-sm text-body-sm text-text-secondary">Loading your copies…</p>}
        {exports.isError && (
          <p className="py-sm text-body-sm text-error">
            {exports.error.message}{' '}
            <button type="button" className="underline" onClick={() => void exports.refetch()}>
              Retry
            </button>
          </p>
        )}
        {!exports.isLoading && !exports.isError && items.length === 0 && (
          <p className="py-sm text-body-sm text-text-secondary">You have not requested a copy yet.</p>
        )}
        {items.map((item) => {
          const state = exportState(item)
          return (
            <div key={item.id} className="flex flex-wrap items-center gap-md border-t border-border py-sm">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-sm">
                  <p className="text-body-sm font-medium text-text-primary">
                    Requested {formatDateTime(item.requested_at)}
                  </p>
                  <Badge color={state.color}>{state.label}</Badge>
                </div>
                {state.note && <p className="text-caption text-text-secondary">{state.note}</p>}
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
                    {download.error.message}
                  </p>
                )}
              </div>
              {item.downloadable && (
                <Button
                  size="sm"
                  loading={download.isPending && download.variables === item.id}
                  onClick={() => startDownload(item.id)}
                >
                  <span className="inline-flex items-center gap-xs">
                    <Download className="h-3.5 w-3.5" aria-hidden />
                    Download
                  </span>
                </Button>
              )}
            </div>
          )
        })}
      </div>
    </Card>
  )
}
