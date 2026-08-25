import { Button } from '@/components/Button'
import { Modal } from '@/components/Modal'

interface CourseFinderSuggestModalProps {
  courseName: string
  /** What happens on confirm, spelled out for the consultant — differs by audience. */
  destinationCopy: React.ReactNode
  pending: boolean
  onCancel: () => void
  onConfirm: () => void
}

// Suggest confirms first and SAYS what it does (user, 2026-08-24: "in popup, mention what is
// happening") — it used to fire the instant the button was tapped, with nothing on screen to
// distinguish it from the reversible "Note down" toggle right next to it, even though Suggest is
// the one action that writes to the person's own record and notifies them. Extracted from
// CourseFinderPage's body in the 2026-08-25 decomposition pass.
export function CourseFinderSuggestModal({
  courseName,
  destinationCopy,
  pending,
  onCancel,
  onConfirm,
}: CourseFinderSuggestModalProps) {
  return (
    <Modal
      onClose={onCancel}
      title="Suggest this course?"
      footer={
        <div className="flex justify-end gap-sm">
          <Button variant="secondary" onClick={onCancel}>
            Cancel
          </Button>
          <Button loading={pending} onClick={onConfirm}>
            Suggest
          </Button>
        </div>
      }
    >
      <p className="text-body-sm text-text-secondary">
        <span className="font-medium text-text-primary">{courseName}</span>
        {destinationCopy}
      </p>
    </Modal>
  )
}
