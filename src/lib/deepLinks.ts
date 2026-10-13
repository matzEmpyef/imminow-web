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
  // `lead_unanswered` (2026-10-09): a student's first contact with a consultancy went unanswered;
  // the notice opens the service follow-up queue, where it is already listed as `lead_no_reply`.
  '/admin/student-followups',
  '/admin/reviews',
  '/administration/commission-details',
  '/administration/consultancy-profile',
  '/administration/course-suggestions',
  // `staff_invite_lapsed` (2026-10-09): an invited person accepted another consultancy's invite and
  // was taken off the team list; the notice opens the team page.
  '/administration/employees',
  '/administration/reviews',
  '/clients',
  '/freelancer/dashboard',
  // The Lead Pool, for staff who may work it (2026-10-09 lead notices).
  '/sales/lead-pool',
  '/staff/conversations',
]

const ALLOWED_PREFIXES = [
  '/admin/applicants/',
  // `institute_course_switched` (owner decision 18): a college switched one of its own courses
  // off or on; the notice opens that college's page, `/admin/colleges/{college_id}`.
  '/admin/colleges/',
  // A bulk import's bell notice (applied, undone) carries `/admin/colleges/import/{import_id}`, the
  // import's own page (`CatalogImportDetailPage`); this same prefix already covers it.
  '/admin/consultancies?',
  '/admin/ratings?',
  '/administration/consultancy-profile?',
  '/clients/',
  // Lead notices carry `/leads/{lead_id}` (e.g. `client_account_deleted` for a chat that closed
  // when its student deleted their account); App.tsx sends it on to the lead's conversation.
  '/leads/',
  // `new_lead` and `lead_reply_overdue` (2026-10-09) carry `/sales/active-leads/{lead_id}`; App.tsx
  // sends it on to the lead's page, `/sales/leads/{lead_id}`.
  '/sales/active-leads/',
  '/staff/conversations/',
]

/** Strips a query string for the exact-match check; prefix entries that want to allow one
 * (`/admin/consultancies?...`) list themselves separately with the `?` included. */
function pathOnly(link: string): string {
  const i = link.indexOf('?')
  return i === -1 ? link : link.slice(0, i)
}

/**
 * True when `link` is a path inside this console: it starts with one `/`, so it can never be an
 * absolute address, a `//host` address or a `javascript:` one. The shape check alone, for a link
 * the server builds for a console screen (Needs Attention) whose targets are not notification
 * routes and so are not on the list below (improvement I-077).
 */
export function isInAppPath(link: string | null | undefined): link is string {
  // A backslash is read as a slash by browsers, so `/\host` would be `//host`.
  return typeof link === 'string' && link.startsWith('/') && !link.startsWith('//') && !link.includes('\\')
}

/**
 * True when `link` is a console route this build actually serves — the only time it's safe to
 * navigate a notification/broadcast `deep_link` straight off the API. Relative paths only: a
 * value starting with `//` or containing a scheme (`http:`, `javascript:`, …) is rejected before
 * the allowlist even runs, so this can never be coaxed into an external or same-origin-bypassing
 * redirect.
 */
export function isAllowedDeepLink(link: string | null | undefined): link is string {
  if (!isInAppPath(link)) return false
  // A link the server left as a template ("/clients/{client_id}") opens a page that cannot load
  // (T1-07). The server fills them in now; this keeps a stray one from being followed.
  if (link.includes('{') || link.includes('}')) return false
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
