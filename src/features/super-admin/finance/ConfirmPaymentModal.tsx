import { Modal } from '@/components/Modal'
import { Button } from '@/components/Button'
import { formatMoneyAmount } from '@/lib/money'
import { useConfirmCommissionPayment, type CommissionPayment } from '@/queries/commission'

const money = formatMoneyAmount

function inr(n: number | null | undefined): string {
  return n == null ? '—' : `₹${n.toLocaleString('en-IN')}`
}

/**
 * The declared → confirmed step (2026-09-11 rebuild, single-payment path — see BulkConfirmModal
 * for the multi-select one). Says the money must already be in immiNow's account and that
 * confirming can't be undone, because this is the action that reduces a consultancy's outstanding
 * balance and counts into platform revenue.
 */
export function ConfirmPaymentModal({ payment, onClose }: { payment: CommissionPayment; onClose: () => void }) {
  const confirm = useConfirmCommissionPayment()

  return (
    <Modal
      onClose={onClose}
      title="Confirm payment received"
      widthRem={28}
      footer={
        <>
          {confirm.isError && <p className="mr-auto self-center text-body-sm text-error">{confirm.error.message}</p>}
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button loading={confirm.isPending} onClick={() => confirm.mutate(payment.id, { onSuccess: onClose })}>
            Confirm received
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-md">
        <div className="rounded-md border border-border bg-background p-md">
          <div className="flex items-center justify-between">
            <span className="text-caption text-text-secondary">Declared amount</span>
            <span className="text-body font-medium text-text-primary">{money(payment.amount)}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-caption text-text-secondary">Case still owes</span>
            <span className="text-body-sm text-text-primary">{inr(payment.entry_outstanding_inr)}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-caption text-text-secondary">Consultancy</span>
            <span className="text-body-sm text-text-primary">{payment.consultancy_name ?? 'Unknown'}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-caption text-text-secondary">Reference</span>
            <span className="text-body-sm text-text-primary">{payment.transaction_id ?? '—'}</span>
          </div>
        </div>
        <p className="text-body-sm text-text-secondary">
          Only confirm once the money is in immiNow&rsquo;s account. This can&rsquo;t be undone.
        </p>
      </div>
    </Modal>
  )
}
