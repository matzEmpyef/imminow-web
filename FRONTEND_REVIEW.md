# immiNow web frontend — architecture & QA review

**Date:** 1 September 2026  
**Scope:** Entire `web/` React + Vite app (consultancy console, platform console, freelancer shell).  
**Method:** Read-only review of routing, auth, API layer, shared components, and feature pages. **No code was changed.**

An interactive summary of the same findings lives in the Cursor canvas `web-frontend-review.canvas.tsx`.

---

## Verdict

This is a mature staff console, not a prototype. Feature-folder layout, a typed OpenAPI client, React Query for server state, Zustand only for session + chat chrome, shared `Table` / `Modal` / form primitives, fail-closed permission and feature gates, and route-level code splitting are all in place. TypeScript is strict; there is no `as any` in `src`.

Do not rewrite it.

The work that will actually reduce risk is:

1. Session teardown (server logout, query cache clear, refresh-token rotation).
2. Role-aware route shells (consultancy vs platform vs freelancer).
3. Honest loading / error / empty states on dashboards, lists, and shell widgets.
4. A handful of cache-invalidation bugs on client detail and support tools.
5. Tests, then splitting the largest page files.

Frontend-only **Critical** issues: none, **if** the API still enforces every permission the UI claims to hide. The findings below are High / Medium / Low.

---

## Architecture snapshot

```
Pages (features/*)  →  queries/*.ts hooks  →  TanStack Query
                                         ↘  openapi-fetch client  →  VITE_API_BASE_URL
Auth: Zustand persist → sessionStorage (`imminow-auth`)
Chrome: AppShell | AdminShell | FreelancerShell  →  SidebarShell
```

| Layer | Location | Role |
|---|---|---|
| Routes | `src/App.tsx` | Lazy page imports, `ProtectedRoute` / `PlatformRoute` / `FreelancerRoute` / gates |
| API | `src/api/client.ts` + generated `schema.d.ts` | Bearer inject, single-flight 401 refresh |
| Server cache | `src/queries/` (~60 modules) | One hook cluster per domain; `ApiError`; `enabled: isAuthed` |
| Client session | `src/stores/authStore.ts` | Tokens + user |
| UI chrome | `src/stores/chatWindowStore.ts` | Floating chat only |
| Shared UI | `src/components/` (~45) | Table, Modal, Drawer, fields, chat, charts |
| Design tokens | `src/styles/tokens.css` | Colors, spacing, type — components should not use raw hex |
| Entitlements | `src/lib/features.ts`, `src/lib/permissions.ts` | Fail closed while loading or on error |

**Runtime:** React 19.2, Vite 8, Tailwind 4, React Router 7, TanStack Query 5, Zustand 5, openapi-fetch, Recharts, oxlint, Prettier.

**QueryClient defaults** (`main.tsx`) are appropriate for a console left open all day: `staleTime` 30s, `gcTime` 5m, no retry on `ApiError`.

**Auth model:** Access + refresh tokens in `sessionStorage`. Middleware attaches `Authorization: Bearer`. On 401 (except auth paths) a single-flight `POST /auth/refresh` runs via bare `fetch`, then the original request is replayed. CSRF is not a cookie-session concern. Route gates are **navigation**, not the security boundary — comments in `PlatformRoute`, `PermissionGate`, and `FeatureGate` say this explicitly.

---

## Findings

Severity:

- **High** — functional bugs, security exposure, or operators acting on false empty/stale data.
- **Medium** — real UX, a11y, maintainability, or defense-in-depth gaps.
- **Low** — hygiene, future i18n, polish. Still worth tracking.

### High

#### H1 — Access and refresh tokens live in `sessionStorage`

**Where:** `src/stores/authStore.ts`

Both tokens and the full `user` object are persisted under `imminow-auth`. Any XSS (or a malicious extension) can read them.

**Impact:** Session theft until expiry or server revocation. Comments say this is a pragmatic Phase 2 choice pending Cognito.

**Fix:** Move refresh (and ideally access) tokens to HttpOnly, Secure, SameSite cookies; keep a short-lived access token in memory if cookies are not viable yet. Keep the existing CSP in `vercel.json`.

---

#### H2 — Logout does not revoke the refresh token

**Where:** `src/components/SidebarShell.tsx` (`handleLogout`)

Logout is `clear()` + `navigate('/login')`. The schema defines `POST /auth/logout`; the client never calls it.

**Impact:** A stolen or leftover refresh token keeps working after the user thinks they signed out. Shared-machine sessions are not truly ended.

**Fix:** Call `POST /auth/logout` first; still clear client state if the request fails.

---

#### H3 — React Query cache survives logout

**Where:** `SidebarShell.tsx`, `main.tsx`

Sensitive cached data (clients, leads, commissions, staff, chat) stays in memory until a full reload.

**Impact:** Next login in the same SPA session can flash or leak the previous user's data. Stale permissions/features can also flash.

**Fix:** `queryClient.clear()` and cancel in-flight queries on logout, then clear the auth store.

---

#### H4 — `ProtectedRoute` is token-only; no consultancy role shell

**Where:** `src/features/auth/ProtectedRoute.tsx`, consultancy routes in `App.tsx`

`PlatformRoute` sends non-platform users to `/dashboard`. `FreelancerRoute` sends non-freelancers away. The inverse is missing: any authenticated role can mount `/dashboard`, `/clients/*`, `/sales/*`, `/administration/*` by URL.

**Impact:** UI/data leakage if any API endpoint is under-gated; confusing UX; larger blast radius of a stolen token.

**Fix:** Add `ConsultancyRoute` allowing `consultancy_admin` / `consultant` (and whoever else is a consultancy staff role). Wrap consultancy routes. Apply the same role check on `/account` and `/notifications`.

---

#### H5 — Refresh path ignores a rotated `refresh_token`

**Where:** `src/api/client.ts` (`requestNewAccessToken`)

The handler types the body as `{ access_token?: string }` and calls `setAccessToken` only. The schema’s `TokenPair` includes both tokens; refresh is documented as rotation.

**Impact:** Surprise logouts after rotation, or a stale refresh token that remains valid if the server is lenient — rotation then does not shrink the replay window.

**Fix:** Persist the full pair. Add `setTokens({ access, refresh })` rather than overloading `setSession` (which currently requires `user`).

---

#### H6 — Platform dashboards hide API failures as empty data

**Where:** `SuperAdminDashboardPage.tsx`, `FinanceDashboardPage.tsx`

Both gate on `isLoading` only. Consultancy `DashboardPage` already has a proper `isError` branch.

**Impact:** Failed Overview charts look like zeros. Failed Finance looks like “No cases match these filters” with a zero running total. Operators can act on a false empty state.

**Fix:** `isError` + shared `ErrorState` + `refetch`.

---

#### H7 — Client detail mutations invalidate the list, not the profile

**Where:** `src/queries/clients.ts` — `useSetClientTags`, `useUpdateClientDetails`, `useSetClientBranch`, `useSetFinalizedCountry`

`onSuccess` only invalidates `['clients']`. `ClientProfilePage` reads `['clients', id]`.

**Impact:** Tags, phone, address, branch, and finalized country look unchanged until staleTime/refocus. Consultants re-edit or distrust the form.

**Fix:** Also `invalidateQueries({ queryKey: ['clients', id] })` using the mutation variables.

---

#### H8 — Support-tool consultancy switch does not invalidate caches

**Where:** `src/queries/supportTools.ts` — `useSwitchConsultancy`

No `onSuccess` invalidation.

**Impact:** After switching a journey, lists, journey detail, and dashboards keep the old consultancy until staleTime or reload.

**Fix:** Invalidate `['clients']`, `['clients', journeyId]`, `['dashboard']`, `['user-search']`.

---

#### H9 — Form builder ignores load errors

**Where:** `src/features/administration/FormBuilderPage.tsx`

Loading is handled; `existing.isError` is not. Save is blocked when `fields.length === 0`, so a *blank* overwrite is unlikely — but a user who then adds fields and saves will `PUT` over the real template.

**Impact:** Silent data loss on the template.

**Fix:** On `existing.isError`, show `ErrorState` and do not mount the editor. Disable Save until load succeeds.

---

#### H10 — Failed fetches look like empty results

**Where (verified examples):**

- `GlobalChatDrawer.tsx` — failure → “No conversations found.”
- `GlobalSearch.tsx` — failure → “No matches”
- `NotificationsDropdown.tsx` — no error UI
- `EmployeesPage.tsx`, `DesignationsPage.tsx` — Table has no `error` prop
- `AuditLogPage.tsx`, `PlatformAuditLogPage.tsx`, `VisitRequestsPage.tsx` — same
- `ClientProfilePage.tsx` `DocumentsTab` — error → “No documents sent yet.”
- `InternalMessagingPage.tsx`, `ClientConversationPage.tsx`, `LeadConversationPage.tsx` — message errors surface as empty chat
- `ShareFromLibraryModal.tsx`, `CollegeDetailModal.tsx` — loading only

**Impact:** Staff assume there is no work and do not retry.

**Fix:** Pass `error={query.isError ? '…' : undefined}` into `Table`. For widgets, distinguish loading / error / empty. Surface `messages.isError` in `ChatPanel`.

---

#### H11 — No frontend tests

**Where:** `web/package.json` — scripts are `dev`, `build`, `lint`, `typecheck`, `format`. Zero `*.test.*` / `*.spec.*` files.

**Impact:** Auth refresh, permission gates, cache keys, and finance views can regress with no signal. Typecheck and oxlint catch types and some lint, not behavior.

**Fix:** Vitest + Testing Library. First slice: `api/client.ts` refresh-on-401 (mocked fetch), `PermissionGate` / `FeatureGate` / `PlatformRoute`, `Table` pagination/sort, one list page per shell. Add Playwright later for login → list → detail.

---

#### H12 — Always-on polling and eager Course Finder fetch

**Where:**

- `queries/conversations.ts` — `refetchInterval: 15000` whenever authed
- `queries/courseFinder.ts` — `enabled: isAuthed` (fires `GET /courses` on every visit, empty filters)
- `queries/leads.ts` / `clients.ts` / `internalMessages.ts` — 5s message polling

**Impact:** Consoles left open all day hammer `/conversations` even if chat is never opened. Course Finder loads the catalog before the consultant searches.

**Fix:** Poll conversations only while the drawer or a floating window is open. Gate `useCourseFinder` on a non-empty search or at least one filter. Set `refetchIntervalInBackground: false` on all interval queries.

---

### Medium

#### M1 — Route gates trust the persisted login snapshot

**Where:** `PlatformRoute.tsx`, `authStore` persist. No boot-time `/profile` refresh.

Revoked `platform_permissions` stay in the sidebar until re-login. Server 403 is the real backstop.

**Fix:** When a token exists at startup, fetch profile and `setUser()`. Optionally refetch on `permission_denied`.

---

#### M2 — Password reset token in the query string

**Where:** `ResetPasswordPage.tsx` (`?token=`). Invite tokens are a path param (`/set-password/:token`) — same class of leak, slightly smaller.

Tokens land in history, logs, and Referer (`Referrer-Policy` is `strict-origin-when-cross-origin`).

**Fix:** Path segment or one-time exchange. Short TTL. `no-referrer` on auth pages.

---

#### M3 — Notification `deep_link` is not validated client-side

**Where:** `NotificationsPage.tsx`, `NotificationsDropdown.tsx`

Server-provided `deep_link` goes straight into `<Link to={…}>`. Schema says the server validates; the client has no defense in depth.

**Fix:** Allow only internal paths (`^/[a-zA-Z0-9/_-]+`). Reject protocol-relative and absolute URLs.

---

#### M4 — `dangerouslySetInnerHTML` in blog preview

**Where:** `BlogAdminPage.tsx`. `RichTextEditor.tsx` `createLink` accepts any URL from `window.prompt` (including `javascript:` depending on the browser).

**Fix:** DOMPurify on preview. Restrict links to `http:` / `https:`.

---

#### M5 — Plan builder UI is duplicated

**Where:** `PlanTemplatesPage.tsx` vs `PlanStepBuilder.tsx` (step rows, `@dnd-kit`, delete confirm, preview).

**Fix:** Shared `PlanStepList` + detail panel.

---

#### M6 — Audit log pages are copy-pasted

**Where:** `AuditLogPage.tsx` vs `PlatformAuditLogPage.tsx`

Nearly identical filters, `labelize()`, columns, expand rows. Only consultancy filter differs.

**Fix:** Shared `AuditLogTable` with a filter slot and a query-hook prop.

---

#### M7 — Narrow viewports keep a 76px icon rail

**Where:** `SidebarShell.tsx` — collapses at 1100px, never off-canvas. Header section nav is `overflow-x-auto` only.

**Fix:** Below ~768px, hide the sidebar off-canvas and open it from a menu button.

---

#### M8 — Tab strips and comboboxes miss ARIA patterns

**Where:** `ClientProfilePage`, `ConsultancyProfilePage`, `CatalogSettingsPage`, `FreelancersPage`, `CommissionDetailsPage` (plain buttons, no `tablist` / `tab` / `tabpanel`). `GlobalSearch`, `SearchSelect`, `Combobox` lack `aria-expanded` / listbox / `aria-activedescendant`.

**Fix:** Shared `Tabs`. Upgrade search widgets to the WAI-ARIA combobox pattern.

---

#### M9 — Table toolbars use raw `<select>` / date inputs

Forms use `h-12` pill `TextField` / `SelectField`. List filters across ~15 pages use `h-10 rounded-md` native controls, often `aria-label` only.

**Fix:** Compact `FilterSelect` / `FilterDate` for `Table.filters`.

---

#### M10 — Custom spacing keys break Tailwind `max-w-*`

**Where:** `src/styles/tailwind.config.ts` (documented)

`spacing.md` collides with Tailwind’s `max-w-md`. The class compiles to `max-width: var(--space-md)` (16px). Already bitten `AppErrorBoundary` and `GlobalSearch`.

**Fix:** Rename spacing tokens (`space-xs`, …) so they do not collide, **or** add a lint forbid for `max-w-sm|md|lg|xl`. Do not assume `theme.extend.maxWidth` fixes it — comments say it does not under this Tailwind v4 `@config` path.

---

#### M11 — `FEATURE_REGISTRY` is duplicated with the mock server

**Where:** `lib/features.ts` (commented as hand-synced with `mock-server`). `App.tsx` builds `FEATURE_BY_KEY` via `Object.fromEntries` (untyped; a missing key makes `FeatureGate` throw on `feature.key`).

**Fix:** Export a typed `FEATURE_BY_KEY` from `lib/features.ts`. Share or generate the registry with the mock server.

---

#### M12 — Platform roles get the consultancy shell on account pages

**Where:** `MyAccountPage.tsx` always `AppShell`. `NotificationsPage.tsx` uses `AdminShell` only when `role === 'super_admin'` — `platform_staff` gets consultancy nav.

**Fix:** Role-aware shell picker (platform → `AdminShell`, freelancer → `FreelancerShell`, else `AppShell`).

---

#### M13 — Invite accept always navigates to `/dashboard`

**Where:** `SetPasswordPage.tsx`

A platform or freelancer invite lands in the consultancy shell. `LoginPage` already branches by role.

**Fix:** After success, route the same way as login.

---

#### M14 — Logged-in users can still open `/login`

**Where:** `LoginPage.tsx`

No bounce. Session can sit in `sessionStorage` while the login form is showing.

**Fix:** If `accessToken` is set, `Navigate` using the same rules as `DefaultRedirect`.

---

#### M15 — God-page files

| File | Approx. lines |
|---|---|
| `ClientProfilePage.tsx` | 1,244 |
| `QuizAdminPage.tsx` | 985 |
| `ConsultancyProfilePage.tsx` | 937 |
| `CollegeDetailPage.tsx` | 721 |
| `ManageConsultanciesPage.tsx` | 718 |
| `PlanStepBuilder.tsx` | 629 |
| `PlanTemplatesPage.tsx` | 582 |

Also over 400: `CourseFormPanels`, `CommissionRatesPage`, `AdsManagerPage`, `CouponsAdminPage`, `LeadConversationPage`, `JobsAdminPage`, `BlogAdminPage`, `CatalogSettingsPage`, `PartnerCollegesPanel`.

**Fix:** One file per tab/section; page = composition + routing.

---

#### M16 — Client profile tab is one-way from the URL

**Where:** `ClientProfilePage.tsx` reads `?tab=` and `?step=` once on mount, never writes back. Sidebar sub-links also do not highlight nested detail routes (`/clients/:id`, `/sales/leads/:id`, `/admin/colleges/:id`, `/administration/forms/:id`).

**Fix:** `setSearchParams` on tab change. Prefix matching on `SidebarSubLink`.

---

#### M17 — Lazy-route Suspense fallback is a bare skeleton

**Where:** `App.tsx` — `<Suspense fallback={<Skeleton className="m-lg h-64 rounded-lg" />}>`

Every code-split navigation flashes a skeleton **outside** the shell.

**Fix:** A fallback that keeps the current shell chrome.

---

#### M18 — One error boundary wraps the entire tree

**Where:** `AppErrorBoundary.tsx` in `main.tsx`

Any render throw whitescreens the whole console until `window.location.reload()`. The boundary does not reset on navigation.

**Fix:** Route-level boundary inside each shell, reset on `location.key`. Keep the top-level one as last resort.

---

#### M19 — Employees table uses non-null assertions on nested `user`

**Where:** `EmployeesPage.tsx` — `employee.user!.first_name`, `employee.id!`

If `user` is missing (partial payload, support-tool erasure), the page throws and takes down the console (see M18).

**Fix:** Optional chaining and a fallback cell. Same pattern anywhere else `user!` is used in table renders.

---

#### M20 — Person picker silently caps at 100 + 100

**Where:** `lib/usePersonPicker.ts`

Course Finder and Assign Task preload 100 clients and 100 leads. No server-side search as the user types.

**Fix:** Server-backed search; drop the hard preload cap as the only discovery path.

---

### Low

| ID | Issue | Where | Fix |
|---|---|---|---|
| L1 | `JSON.parse` of sessionStorage can throw | `authStore.ts` | try/catch → `removeItem` |
| L2 | Course Finder UI state in `localStorage` (applicant IDs) | `courseFinderState.ts` | Clear on logout or use `sessionStorage` |
| L3 | Login / Forgot Password duplicate email regex | `LoginPage.tsx`, `ForgotPasswordPage.tsx` | Use `lib/validation.ts` |
| L4 | Document title is always “immiNow” | `index.html`, no `document.title` updates | `usePageTitle` from route |
| L5 | No skip-to-content; tables have no page-size control | `SidebarShell.tsx`, `Table.tsx` | Skip link; optional `pageSize` |
| L6 | No i18n; API already has locale fields | entire `src` | Start at shell + Table defaults when needed |
| L7 | `const FEATURE_BY_KEY` then a later `import` in `App.tsx` | `App.tsx` | Export typed map from `lib/features.ts` |
| L8 | Some hooks `throw new ApiError(error.error.message)` with no fallback | `staff.ts`, `tags.ts`, `leads.ts`, `supportTools.ts` | Always `new ApiError('fallback', error)` |

---

## Forms, tables, search, filters, pagination

**What works:** Shared `Table` is the de facto DataTable — search (debounced), sort (`aria-sort`), cursor pagination, optional selection/expand, `loading` / `error` / `emptyMessage`, `hideBelow` for columns. `useCursorPagination` is centralized. Most list pages use this stack.

**Gaps:**

- Several list pages omit `error` (H10).
- Filter slot styling is inconsistent (M9).
- Page size is hardcoded (`limit: 20` typical); users cannot change it (L5).
- Mixed strategies: cursor (most lists), client-side page index (`BlogAdminPage`), client-side sort (`PerformanceLeaguePage`), in-modal filter (`PersonListModal`). Document when each is allowed.
- Global search runs `/leads` + `/clients` in parallel and maps errors to “No matches” (H10).
- Client-side employee search is fine because `useEmployees` loads the full roster (no pagination on that endpoint). If that API ever paginates, this will silently miss people.

**Forms:** Shared `isValidEmail` / `isValidPhone` are used in most modals. Login and Forgot Password reimplement the email regex (L3). Password policy is client-side “8 characters” only (`ResetPasswordPage`, `SetPasswordPage`, `ChangePasswordModal`) — keep in lockstep with the server. `Button` defaults to `type="button"`, which correctly prevents accidental submits. Several tall modals do not use `Modal`’s pinned `footer`, so Save can scroll out of view (`CommissionRatesPage` editor, `JobsAdminPage`, `RedemptionPartnersPage`).

**Dead fields:** No fully disconnected fields found in spot checks. Intentional: `TargetingFilter` `unknownDataPolicy` is display-only; `MyAccountPage` omits student-only `blog_push`.

---

## Navigation

Sidebar links in `AppShell` and `AdminShell` match `App.tsx` routes. Feature/permission filtering on nav is fail-closed (failed fetch hides links; gates explain on direct URL).

**Inconsistencies:**

- `/administration/commission-details` has no `PermissionGate` in `App.tsx`; the page checks `billing.view_commission_details` inline.
- `/administration/forms` is Starter-core (no permission) — intentional.
- Phonebook / document library / internal messaging / audit-log are feature-gated only (any staff on an entitled plan).
- Dashboard section `matches` absorbs phonebook, document library, and internal messaging paths (intentional; documented in `AppShell`).
- `/admin/freelancer-rates` redirects to `/admin/freelancers` (rates live as a panel). `FreelancerRatesPage.tsx` remains as that panel — not dead.
- Detail routes do not highlight the parent sub-link (M16).
- `DefaultRedirect` on `*` role-routes unknown paths correctly; `/login` does not (M14).

---

## Accessibility & visual quality

**Strengths:** Modal/Drawer `role="dialog"`, `aria-modal`, focus trap, Escape. Table sortable headers are buttons with `aria-sort`. `TextField` / `SelectField` wire `aria-invalid` and error ids. Widespread `aria-label` on icon buttons. Login errors use `role="alert"`. Tokenized colors; little ad-hoc hex.

**Gaps:** Tabs (M8), comboboxes (M8), skip link (L5), static document title (L4), mobile rail (M7), `text-text-secondary` (#64748b) on `#f8fafc` — verify WCAG AA for captions. Backdrop close buttons should set `type="button"`. `hideBelow` on table columns is underused (~8 column defs).

Professional visual quality is generally good: shared pills, cards, typography scale. The main visual debt is filter-toolbar vs form-control mismatch, not a missing design system.

---

## Performance & bundle

- **Good:** Lazy routes after an earlier ~1.35MB single-bundle audit. React Query dedupes `useClient` / `useEmployees` across parent + tabs.
- **Cost:** Recharts is heavy but used. Conversation polling + Course Finder eager fetch (H12). `ClientProfilePage` always calls `usePlan(id)` even when the Plan tab is inactive — move the hook into `PlanTab` or `enabled` on tab.
- **Landmine:** `max-w-*` (M10).
- No React Query Devtools in the tree (fine for prod; useful behind a flag in dev).

---

## TypeScript & React/Vite practice

**Good:** `strict`, `noUnusedLocals`, `noUnusedParameters`, `verbatimModuleSyntax`. Path alias `@/`. Hosted builds fail without `VITE_API_BASE_URL`. oxlint `--max-warnings=0`.

**Gaps:** `noUncheckedIndexedAccess` is off (hides `FEATURE_BY_KEY.multi_branch` possibly undefined). `as unknown as` at FormData upload boundaries (documented). `skipLibCheck: true` is normal. Mid-file import in `App.tsx` (L7). Non-null assertions in table renders (M19).

---

## Security notes (frontend)

| Topic | Status |
|---|---|
| Secrets in frontend env | Only `VITE_API_BASE_URL`, `VITE_APP_VERSION` |
| CSRF | Bearer-in-header SPA — no classic CSRF surface |
| CSP | Production `vercel.json` allowlists staging/prod API origins |
| `eval` / `document.cookie` | Not found |
| Forgot password | Does not enumerate accounts |
| Google OAuth | Disabled placeholder — when enabled, use auth-code + PKCE |
| XSS | Blog preview + rich text (M4); tokens in JS storage (H1) |

Frontend gates are not the security boundary. Highest practical risk is **token exposure + incomplete logout**, then **cross-role route mounting** if any API check is missing.

---

## Recommended sequence

1. **Session teardown** — H2, H3, H5, then plan H1 (HttpOnly cookies).
2. **Role shells** — H4, M12, M13, M14.
3. **Honest errors** — H6, H10.
4. **Cache correctness** — H7, H8, H9.
5. **Load** — H12; `refetchIntervalInBackground: false`.
6. **Tests** — H11, focused on refresh, gates, Table.
7. **Split god pages + shared plan/audit primitives** — M15, M5, M6.
8. **A11y / polish** — M7, M8, M9, M10, M16, M17, M18, then Lows.

---

## What not to churn

- Do not invent a second table component; extend `Table`.
- Do not put server cache in Zustand.
- Do not gate security only in the sidebar — keep route gates + server 403.
- Do not add a feature flag only in the client; the mock server registry must move with it (M11).
- Do not use `max-w-md` / `max-w-lg` until M10 is fixed — use inline `style={{ maxWidth }}`.

---

## Appendix — page inventory (routes)

Public: `/login`, `/forgot-password`, `/reset-password`, `/set-password/:token`.

Consultancy (`ProtectedRoute`): dashboard, sales (pool, active, conversation), clients (list, course finder, invoices, receipts, profile, conversation), administration (profile, commission, templates, suggestions, forms, branches, employees, designations, phonebook, documents, messaging, audit), activity, account, notifications.

Platform (`PlatformRoute`): dashboard, supply-demand, platform-pulse, consultancies, applicant allocation, performance league, catalog (colleges, countries, institutions, guides, settings, suggestions review), ads, earn/coupons/redemption, content (webinars, quiz, meetings, jobs, blog), finance (rates, payouts, freelancers, finance dashboard), support (tools, complaints, visits), platform staff admin (team, user directories, notification channels, app config, broadcast, platform audit).

Freelancer: `/freelancer/dashboard` only.
