import { useState, type ReactNode } from 'react'
import { RotateCcw } from 'lucide-react'
import { StopPropagation } from '@/components/StopPropagation'

/**
 * The Reopen icon on a closed row of a list, with the confirmation it opens — shared by the
 * leads list and the clients list (review F-147), which each had their own copy. Whether the row
 * is offered Reopen at all is `lib/reopenRules.ts`'s decision; a caller renders this only when
 * that says yes.
 *
 * Modal isn't a portal, so without StopPropagation a click inside the confirm popup would bubble
 * through the cell into the row's own onClick and navigate away — same wrapper
 * AssignConsultantMenu.tsx/TagEditorMenu.tsx already use.
 */
export function ReopenTrigger({
  name,
  renderModal,
}: {
  /** Who the row is about, for the button's accessible name. */
  name: string
  renderModal: (close: () => void) => ReactNode
}) {
  const [open, setOpen] = useState(false)
  return (
    <StopPropagation>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={`Reopen ${name}`}
        title={`Reopen ${name}`}
        className="flex h-9 w-9 items-center justify-center rounded-md text-text-secondary hover:bg-background hover:text-text-primary"
      >
        <RotateCcw className="h-4 w-4" />
      </button>
      {open && renderModal(() => setOpen(false))}
    </StopPropagation>
  )
}
