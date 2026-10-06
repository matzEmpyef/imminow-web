import type { ReactNode } from 'react'
import { CheckCircle2, CircleDashed, Loader2, MinusCircle, XCircle } from 'lucide-react'
import type { BatchRow, BatchRowStatus } from '@/lib/useBatchRun'

interface StatusLook {
  Icon: typeof CheckCircle2
  tone: string
}

const LOOK: Record<BatchRowStatus, StatusLook> = {
  waiting: { Icon: CircleDashed, tone: 'text-text-secondary' },
  running: { Icon: Loader2, tone: 'text-primary' },
  done: { Icon: CheckCircle2, tone: 'text-success' },
  failed: { Icon: XCircle, tone: 'text-error' },
  skipped: { Icon: MinusCircle, tone: 'text-text-secondary' },
}

/** The words for each row's state; `done` differs by dialog ("Confirmed", "Recorded"). */
export interface BatchWords {
  done: string
  running: string
}

function statusText(row: BatchRow<unknown>, words: BatchWords): string {
  if (row.status === 'done') return words.done
  if (row.status === 'running') return words.running
  if (row.status === 'failed') return 'Failed'
  if (row.status === 'skipped') return 'Not sent'
  return 'Waiting'
}

/**
 * One line per row of a batch, each with what happened to it (review F-153): shown while the batch
 * runs and as its result. A failure carries its reason; a row the batch was stopped before says
 * "Not sent", so nobody has to guess which rows went through. Used with `useBatchRun`.
 */
export function BatchResultList<T>({
  rows,
  rowKey,
  renderLabel,
  words,
}: {
  rows: BatchRow<T>[]
  rowKey: (item: T) => string
  renderLabel: (item: T) => ReactNode
  words: BatchWords
}) {
  return (
    <ul className="flex max-h-80 flex-col overflow-y-auto rounded-md border border-border" aria-label="Result for each row">
      {rows.map((row) => {
        const { Icon, tone } = LOOK[row.status]
        return (
          <li
            key={rowKey(row.item)}
            data-status={row.status}
            className="flex items-start gap-sm border-b border-border px-sm py-xs last:border-b-0"
          >
            <Icon
              className={`mt-0.5 h-4 w-4 shrink-0 ${tone} ${row.status === 'running' ? 'animate-spin' : ''}`}
              aria-hidden
            />
            <div className="min-w-0 flex-1">
              <div className="text-body-sm text-text-primary">{renderLabel(row.item)}</div>
              {row.status === 'failed' && row.error && <p className="text-caption text-error">{row.error}</p>}
            </div>
            <span className={`shrink-0 text-caption font-medium ${tone}`}>{statusText(row, words)}</span>
          </li>
        )
      })}
    </ul>
  )
}
