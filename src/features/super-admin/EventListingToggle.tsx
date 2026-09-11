import { useState } from 'react'
import { Eye, EyeOff } from 'lucide-react'
import { Badge } from '@/components/Badge'
import { Button } from '@/components/Button'
import { Modal } from '@/components/Modal'
import { useUpdateEvent } from '@/queries/eventsAdmin'
import type { components } from '@/api/schema'

type Event = components['schemas']['Event']

// Soft delete for webinars and physical meetings (user, 2026-09-04: "option to soft delete or
// remove the app from listing"). Unlisting hides the event from the student app — list and
// detail — while this console keeps it, with RSVPs and attendance intact, and can restore it.
// Nothing is deleted. Unlisting gets a confirm (the standing "wherever there is delete, confirm
// popup" rule — this is the closest thing to one); restoring is a plain click, since it only
// puts back what was there.
export function EventListingToggle({ event }: { event: Event }) {
  const updateEvent = useUpdateEvent(event.id!)
  const [confirming, setConfirming] = useState(false)
  const unlisted = event.listed === false
  // 2026-09-11 (Marketing review): unlisting an upcoming webinar/meeting that already has
  // registrants now notifies them it's cancelled (server-side) — the confirm copy previously said
  // nothing about that, so an admin removing a nearly-full webinar had no warning students would
  // hear from it. Quiz isn't included: it has no RSVPs, and voiding (not unlisting) is its
  // cancel-and-notify path — see VoidQuizAction's own confirm copy.
  const notifiesRegistrants = event.type !== 'quiz' && event.status === 'upcoming' && (event.rsvp_count ?? 0) > 0

  if (unlisted) {
    return (
      <span className="flex items-center gap-xs">
        <Badge color="secondary">Unlisted</Badge>
        <button
          type="button"
          onClick={() => updateEvent.mutate({ listed: true })}
          aria-label={`Restore ${event.title} to the app`}
          title="Restore to the app"
          className="flex h-9 w-9 items-center justify-center rounded-md text-text-secondary hover:bg-background hover:text-text-primary"
        >
          <Eye className="h-4 w-4" />
        </button>
      </span>
    )
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setConfirming(true)}
        aria-label={`Remove ${event.title} from the app`}
        title="Remove from the app"
        className="flex h-9 w-9 items-center justify-center rounded-md text-text-secondary hover:bg-background hover:text-error"
      >
        <EyeOff className="h-4 w-4" />
      </button>
      {confirming && (
        <Modal
          onClose={() => setConfirming(false)}
          title="Remove from the app"
          widthRem={24}
          footer={
            <div className="flex justify-end gap-sm">
              <Button variant="secondary" onClick={() => setConfirming(false)}>
                Cancel
              </Button>
              <Button
                variant="destructive"
                loading={updateEvent.isPending}
                onClick={() => updateEvent.mutate({ listed: false }, { onSuccess: () => setConfirming(false) })}
              >
                Remove
              </Button>
            </div>
          }
        >
          <p className="text-body-sm text-text-secondary">
            Remove <span className="font-medium text-text-primary">{event.title}</span> from the Sentpo app? Students
            will no longer see it.{' '}
            {notifiesRegistrants && "Registered students will be told it's cancelled. "}
            RSVPs and attendance are kept, and you can restore it here at any time.
          </p>
        </Modal>
      )}
    </>
  )
}
