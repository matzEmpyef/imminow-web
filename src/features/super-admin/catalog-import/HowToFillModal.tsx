import { Button } from '@/components/Button'
import { Modal } from '@/components/Modal'
import { HOW_TO_FILL_STEPS } from './catalogImportWords'

/**
 * "How to fill it": the short numbered guide to the import workbook. Opens by itself when the
 * template is downloaded, and from the link on the Import page. It only shows information, so a
 * click outside or Escape closes it.
 */
export function HowToFillModal({ onClose }: { onClose: () => void }) {
  return (
    <Modal
      onClose={onClose}
      title="How to fill it"
      widthRem={36}
      dismissible
      footer={<Button onClick={onClose}>Got it</Button>}
    >
      <ol className="flex flex-col gap-sm">
        {HOW_TO_FILL_STEPS.map((step, index) => (
          <li key={step} className="flex items-start gap-sm">
            <span
              aria-hidden
              className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-caption font-medium text-primary"
            >
              {index + 1}
            </span>
            <span className="min-w-0 text-body-sm text-text-primary">
              <span className="sr-only">Step {index + 1}: </span>
              {step}
            </span>
          </li>
        ))}
      </ol>
    </Modal>
  )
}
