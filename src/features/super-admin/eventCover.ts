import type { AspectRequirement } from '@/lib/imageAspect'

// One cover rule for all three event types (user decision, 2026-09-13 — "image SIZES are fixed on
// immiNow"). Webinars, in-person meetings and quizzes all land in the same Happening Now carousel
// on the app's Home and on the same event page, so the shape is a property of the PLACEMENT, not
// of the page that happens to be editing the event — hence one exported constant the three forms
// share rather than three literals free to drift apart.
export const EVENT_COVER_ASPECT: AspectRequirement = {
  width: 16,
  height: 9,
  tolerance: 0.05,
  idealLabel: '1280×720',
  minWidth: 960,
  subject: 'Event covers',
}

export const EVENT_COVER_HINT =
  "16:9 — shown full-width in the app's Happening Now and on the event page. Optional; without it the app shows a colour card."
