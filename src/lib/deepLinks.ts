// Contract gate 9, K8 / Review Triage item 6 ("[W4 · notifications] Notification deep_link
// client-side allowlist", web M3) — defense in depth, same shape as the mobile app's own
// `_deepLinkPrefixes` (mobile/lib/features/home/notifications_screen.dart). The server already
// guarantees every catalogued notification type carries a real `deep_link` (contract gate 9), and
// Broadcast's own `deep_link` is validated server-side before it is ever stored — but a client
// still should not blindly `navigate()`/`<Link to>` a string straight off the wire: an
// unrecognised or malformed value (a stale row predating a catalogue entry, a future notification
// type this build doesn't know yet, or — belt and braces — a server bug) should fail silently,
// not push the console's router somewhere unroutable or, worse, something an attacker-controlled
// value could turn into an open redirect if this ever grew to accept absolute URLs.
//
// Prefix list built from every `deep_link` value the contract's notification producers actually
// emit for a STAFF/PLATFORM recipient (mock-server-g10/server.js `notify()`/`broadcast` call
// sites) that has a real route in `App.tsx`. Student-app-only paths (`/points`, `/plan`,
// `/shortlist`, `/event/…`, `/job/…`, `/article/…`, `/chat`, `/leads`, `/home`, …) are
// deliberately NOT here — the console has no screen for them, so a row carrying one is exactly
// the "mark read and do nothing" case, same as the app does for a console-only link it receives.
const ALLOWED_EXACT = [
  '/account',
  '/admin/blog',
  '/admin/commission-rates',
  '/admin/complaints',
  '/admin/consultancies',
  '/admin/disputes',
  '/admin/finance-dashboard',
  '/admin/ratings',
  '/admin/reviews',
  '/administration/commission-details',
  '/administration/consultancy-profile',
  '/administration/course-suggestions',
  '/administration/reviews',
  '/clients',
  '/freelancer/dashboard',
  '/staff/conversations',
]

const ALLOWED_PREFIXES = [
  '/admin/applicants/',
  '/admin/consultancies?',
  '/admin/ratings?',
  '/administration/consultancy-profile?',
  '/clients/',
  '/staff/conversations/',
]

/** Strips a query string for the exact-match check; prefix entries that want to allow one
 * (`/admin/consultancies?...`) list themselves separately with the `?` included. */
function pathOnly(link: string): string {
  const i = link.indexOf('?')
  return i === -1 ? link : link.slice(0, i)
}

/**
 * True when `link` is a console route this build actually serves — the only time it's safe to
 * navigate a notification/broadcast `deep_link` straight off the API. Relative paths only: a
 * value starting with `//` or containing a scheme (`http:`, `javascript:`, …) is rejected before
 * the allowlist even runs, so this can never be coaxed into an external or same-origin-bypassing
 * redirect.
 */
export function isAllowedDeepLink(link: string | null | undefined): link is string {
  if (!link || !link.startsWith('/') || link.startsWith('//')) return false
  if (ALLOWED_EXACT.includes(link) || ALLOWED_EXACT.includes(pathOnly(link))) return true
  return ALLOWED_PREFIXES.some((prefix) => link.startsWith(prefix) && link.length > prefix.length)
}

/** `link` if it passes the allowlist, else `fallback` — the common "navigate here, or fall back to
 * somewhere sane" call shape. Overloaded so a string fallback (the common case — every call site
 * in this console passes one) keeps the return type a plain `string` for `<Link to>`, rather than
 * forcing every caller to narrow away a `null` the function can then never actually produce. */
export function safeDeepLink(link: string | null | undefined, fallback: string): string
export function safeDeepLink(link: string | null | undefined, fallback?: null): string | null
export function safeDeepLink(link: string | null | undefined, fallback: string | null = null): string | null {
  return isAllowedDeepLink(link) ? link : fallback
}
