// Split out of QuizAdminPage.tsx (Phase 3 plan, Tier B3, 2026-09-03) — pure movement unless noted.
import { useState, type FormEvent } from 'react'
import { Button } from '@/components/Button'
import { Modal } from '@/components/Modal'
import { ImageUploadField } from '@/components/ImageUploadField'
import { useUpdateEvent } from '@/queries/eventsAdmin'
import { type Event } from './quizShared'

// User-requested (2026-08-18) — "No quiz needs ad options too... do not include in the existing
// popup." Build reference 1.13's "three configurable branding placements" (pre-load screen,
// persistent banner during questions, results screen) have existed in the schema/seed data since
// Wave 5b but were never exposed in any admin UI (flagged as a known gap in PROGRESS.md). Built
// here as its own popup, deliberately kept out of the already-large Quiz Details settings modal
// per the explicit ask, reachable via its own icon on the Quiz list row (same pattern as Manage
// Questions/Void) — distinct from the Ads Manager's home-screen carousel, which can already
// link out to a specific quiz via its existing destination_type: 'event' picker; this is sponsor
// creative shown *inside* the quiz-taking flow itself, not a separate app-wide banner.
// Fields upgraded from typed-in "image URL" text boxes to real ImageUploadField pickers same day
// (user: "We should be able to upload the image. No point just giving image name.. these are not
// mandatory images") — each placement stays independently optional, with a Remove (X) affordance
// once one is set. Ideal-size hints added the same day for Pre-load screen (320×250px) and
// In-quiz banner (320×50px) per the user's own numbers; Results screen has none since none were
// given.
export function QuizBrandingModal({ event, onClose }: { event: Event; onClose: () => void }) {
  const updateEvent = useUpdateEvent(event.id!)
  const branding = (event.branding ?? {}) as Record<string, unknown>
  const [preloadScreen, setPreloadScreen] = useState(
    typeof branding.preload_screen === 'string' ? branding.preload_screen : '',
  )
  const [inQuizBanner, setInQuizBanner] = useState(
    typeof branding.in_quiz_banner === 'string' ? branding.in_quiz_banner : '',
  )
  const [resultsScreen, setResultsScreen] = useState(
    typeof branding.results_screen === 'string' ? branding.results_screen : '',
  )

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    // Blank placements are OMITTED, never written as null. `branding` is a free-form jsonb map,
    // which openapi-generator types as `Map<String, Object>` in Dart — non-nullable *values* — so a
    // single null inside it makes the whole event response unparseable and takes the student's
    // Events tab down with it. That exact defect shipped once already (Session 32); the mock
    // server strips nulls defensively on the way out, but writing them here would put them
    // straight back the moment a real backend serves what it was given.
    const branding = Object.fromEntries(
      Object.entries({
        preload_screen: preloadScreen,
        in_quiz_banner: inQuizBanner,
        results_screen: resultsScreen,
      }).filter(([, value]) => Boolean(value)),
    )
    updateEvent.mutate({ branding }, { onSuccess: () => onClose() })
  }

  return (
    <Modal
      onClose={onClose}
      title={`${event.title} — Branding`}
      widthRem={32}
      footer={
        <Button type="submit" form="quiz-branding-form" loading={updateEvent.isPending}>
          Save
        </Button>
      }
    >
      <form id="quiz-branding-form" onSubmit={handleSubmit} className="flex flex-col gap-md">
        <p className="text-body-sm text-text-secondary">
          Sponsor creative shown during the quiz-taking flow itself, distinct from the Ads Manager's home-screen
          carousel.
        </p>
        <p className="text-caption text-text-secondary">
          Each placement is independent and none is required — leave one blank and the app simply skips it. There is no
          fallback creative.
        </p>
        <ImageUploadField
          label="Pre-load screen image"
          value={preloadScreen}
          onChange={setPreloadScreen}
          hint="Portrait card shown before the quiz starts. Ideal size 320×250px."
        />
        <ImageUploadField
          label="In-quiz banner image"
          value={inQuizBanner}
          onChange={setInQuizBanner}
          hint="Thin strip above the question. Ideal size 320×50px."
        />
        <ImageUploadField
          label="Results screen image"
          value={resultsScreen}
          onChange={setResultsScreen}
          hint="Shown with the student's score. Ideal size 320×250px."
        />
      </form>
    </Modal>
  )
}
