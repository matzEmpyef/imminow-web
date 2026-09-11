import { useState } from 'react'
import { Modal } from '@/components/Modal'
import { Button } from '@/components/Button'
import { money } from './money'
import { useConfirmCommissionPayment, type CommissionPayment } from '@/queries/commission'


interface Result {
  succeeded: number
  failed: number
}

/**
 * Confirms a batch of declared payments (2026-09-11 Awaiting Confirmation bulk bar). The endpoint
 * only confirms one payment at a time, so this runs them in sequence and reports how many landed —
 * a partial failure (one payment already rejected by someone else, say) shouldn't hide behind a
 * single all-or-nothing error.
 */
export function BulkConfirmModal({
  payments,
  onClose,
  onDone,
}: {
  payments: CommissionPayment[]
  onClose: () => void
  onDone: () => void
}) {
  const confirm = useConfirmCommissionPayment()
  const [running, setRunning] = useState(false)
  const [result, setResult] = useState<Result | null>(null)
  const total = payments.reduce((sum, p) => sum + (p.amount.amount ?? 0), 0)

  async function handleConfirm() {
    setRunning(true)
    let succeeded = 0
    let failed = 0
    for (const payment of payments) {
      try {
        await confirm.mutateAsync({ paymentId: payment.id })
        succeeded++
      } catch {
        failed++
      }
    }
    setRunning(false)
    setResult({ succeeded, failed })
    onDone()
  }

  return (
    <Modal
      onClose={onClose}
      title={`Confirm ${payments.length} selected payment${payments.length === 1 ? '' : 's'}`}
      widthRem={28}
      footer={
        result ? (
          <Button onClick={onClose}>Done</Button>
        ) : (
          <>
            <Button variant="secondary" onClick={onClose} disabled={running}>
              Cancel
            </Button>
            <Button loading={running} onClick={handleConfirm}>
              Confirm received
            </Button>
          </>
        )
      }
    >
      <div className="flex flex-col gap-md">
        {result ? (
          <p className="text-body-sm text-text-primary">
            {result.succeeded} confirmed{result.failed > 0 ? `, ${result.failed} failed — try those again individually.` : '.'}
          </p>
        ) : (
          <>
            <p className="text-body-sm text-text-secondary">
              Only confirm once the money is in immiNow&rsquo;s account. This can&rsquo;t be undone.
            </p>
            <div className="flex max-h-64 flex-col gap-xs overflow-y-auto rounded-md border border-border">
              {payments.map((p) => (
                <div key={p.id} className="flex items-center justify-between gap-sm border-b border-border px-sm py-xs last:border-b-0">
                  <span className="text-body-sm text-text-primary">{p.consultancy_name ?? 'Unknown'}</span>
                  <span className="text-body-sm tabular-nums text-text-primary">{money(p.amount)}</span>
                </div>
              ))}
            </div>
            <p className="text-body-sm font-medium text-text-primary">Total: ₹{total.toLocaleString('en-IN')}</p>
          </>
        )}
      </div>
    </Modal>
  )
}
