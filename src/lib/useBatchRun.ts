import { useCallback, useRef, useState } from 'react'

/**
 *   waiting  not reached yet
 *   running  being sent now
 *   done     the server accepted it
 *   failed   the server refused it, or there was no answer (`error` says which)
 *   skipped  never sent, because the batch was stopped first
 */
export type BatchRowStatus = 'waiting' | 'running' | 'done' | 'failed' | 'skipped'

export interface BatchRow<T> {
  item: T
  status: BatchRowStatus
  /** Why it failed, in the server's words when it gave any. */
  error?: string
}

export interface BatchRun<T> {
  /** One entry per item of the batch that was started, in order. Empty before `start`. */
  rows: BatchRow<T>[]
  /** A batch is being sent. The dialog must not be closable while this is true. */
  running: boolean
  /** Stop was asked for; the row in flight finishes and nothing after it is sent. */
  stopping: boolean
  /** The batch ran to its end or was stopped: `rows` is the result. */
  finished: boolean
  counts: { done: number; failed: number; skipped: number }
  start: (items: readonly T[]) => Promise<void>
  /** Ask the batch to stop after the row now in flight. */
  stop: () => void
}

/**
 * Runs a list of saves one after another and keeps a result for each (review F-153). For the
 * dialogs that act on many rows through a route that takes one at a time: bulk confirm of
 * payments, bulk payout.
 *
 * What each of those got wrong on its own:
 *
 *   - closing the dialog did not stop the loop. The remaining payments were still confirmed, out
 *     of sight, and the operator who had closed it to stop might select and confirm again. `stop`
 *     is checked between rows, and `running` is what the dialog locks its close control on;
 *   - a partial failure said "2 failed" without saying which. Every row has its own status and,
 *     for a failure, the reason.
 *
 * The rows are a snapshot taken at `start`: the list behind the dialog refreshes as each save
 * lands and rows leave it, which must not change what this batch is or what its result shows.
 */
export function useBatchRun<T>(runOne: (item: T) => Promise<unknown>): BatchRun<T> {
  const [rows, setRows] = useState<BatchRow<T>[]>([])
  const [running, setRunning] = useState(false)
  const [stopping, setStopping] = useState(false)
  const [finished, setFinished] = useState(false)
  // A ref, read between rows in the same loop that set off the saves: state would be a render late.
  const stopRequested = useRef(false)
  const inProgress = useRef(false)

  const start = useCallback(
    async (items: readonly T[]) => {
      if (inProgress.current) return
      inProgress.current = true
      stopRequested.current = false
      setStopping(false)
      setFinished(false)
      setRunning(true)
      const result: BatchRow<T>[] = items.map((item) => ({ item, status: 'waiting' }))
      const publish = () => setRows(result.map((row) => ({ ...row })))
      publish()
      for (let i = 0; i < result.length; i += 1) {
        if (stopRequested.current) {
          result[i].status = 'skipped'
          continue
        }
        result[i].status = 'running'
        publish()
        try {
          await runOne(result[i].item)
          result[i].status = 'done'
        } catch (error) {
          result[i].status = 'failed'
          result[i].error = error instanceof Error && error.message ? error.message : 'It did not go through.'
        }
        publish()
      }
      publish()
      inProgress.current = false
      setRunning(false)
      setStopping(false)
      setFinished(true)
    },
    [runOne],
  )

  const stop = useCallback(() => {
    if (!inProgress.current) return
    stopRequested.current = true
    setStopping(true)
  }, [])

  const counts = {
    done: rows.filter((row) => row.status === 'done').length,
    failed: rows.filter((row) => row.status === 'failed').length,
    skipped: rows.filter((row) => row.status === 'skipped').length,
  }

  return { rows, running, stopping, finished, counts, start, stop }
}

/** "3 confirmed. 1 failed. 2 not sent." — only the parts that apply. */
export function batchSummary(counts: { done: number; failed: number; skipped: number }, doneWord: string): string {
  const parts = [`${counts.done} ${doneWord}.`]
  if (counts.failed > 0) parts.push(`${counts.failed} failed.`)
  if (counts.skipped > 0) parts.push(`${counts.skipped} not sent.`)
  return parts.join(' ')
}
