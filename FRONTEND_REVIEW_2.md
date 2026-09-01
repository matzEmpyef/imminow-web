# immiNow web frontend — second-pass review

**Date:** 1 September 2026  
**Scope:** `web/` after two fix batches. First-pass findings: [`web/FRONTEND_REVIEW.md`](web/FRONTEND_REVIEW.md) (that file lives under `web/`, not the repo root).  
**Method:** Read-only. Every item below is checked against the current source. Known deferred decisions from the prompt (Cognito session model, mock-only behaviour, tests, i18n, a11y pass, god-file splits, `max-w-*`, Google/2FA placeholders, DOMPurify/deep-link allowlists) are not re-reported.

---

## Regression checks

| Batch | Result | Notes |
|---|---|---|
| Logout (`POST /auth/logout` + store clear + `queryClient.clear()`) | **PARTIAL** | Button path is complete. Session teardown in `api/client.ts` on failed refresh still only `clear()`s the auth store. |
| Role shells (`ConsultancyRoute`, `roleHome.ts`, bounces, account/notifications pickers, SetPassword, student → `/account`) | **PASS** | Every `App.tsx` route is on the right guard. No redirect cycle for any `User.role` enum value after a successful login. Lazy routes still render. One *new* gap: students on `/account` still get consultancy `AppShell` (finding N2). |
| Honest error+retry | **PARTIAL** | Full-page dashboards, Form Builder, Table `error=`, conversation `ChatPanel` retries, and Global Search are correct. Two converted widgets lost **loading**; Activity “Mark Done” still swallows mutation errors; Super Admin “Pending Allocation” still treats a failed queue fetch as `0`. |
| Polling gates | **PASS** | `useConversations(open)` polls only while the drawer is open; the query still runs once on mount for the badge. Course Finder `enabled: isAuthed && hasFilters`. Remaining 5s thread polling was already listed in pass 1 (H12 remainder) and was not in this batch. |
| `useSwitchConsultancy` invalidation | **PASS** | Invalidates `['clients']` (prefix: list + `['clients', journeyId]` + nested client keys), `['dashboard']` (prefix: all scopes), and `['user-search']`. Nothing else on Support Tools reads consultancy-scoped caches. |

### Logout — what passed

`SidebarShell.handleLogout` (`web/src/components/SidebarShell.tsx:66-79`) captures the access token, `POST`s `/auth/logout` with an explicit `Authorization` header, then `clear()` + `queryClient.clear()` + `navigate('/login')`. Fire-and-forget is intentional so a failed revoke cannot trap the user. Grep finds **no other logout button**. After `clear()`, hooks gated on `enabled: isAuthed` stop; nothing keeps reading the cache as the current user.

### Logout — half-applied

`web/src/api/client.ts:87-88`, `:97-98`, `:105` still call only `useAuthStore.getState().clear()` when refresh fails or the replay is still 401. That is a second session-end path. See **N1**.

### Role shells — what passed

- `roleHomePath` (`web/src/lib/roleHome.ts:12-21`): `super_admin` / `platform_staff` → `/admin/dashboard`; `freelancer` → `/freelancer/dashboard`; `student` → `/account`; else → `/dashboard`.
- `ConsultancyRoute` (`ConsultancyRoute.tsx:17`) allows only `consultancy_admin` | `consultant`.
- `PlatformRoute` (`PlatformRoute.tsx:31`) bounces missing `platform_permissions` via `roleHomePath`, not hardcoded `/dashboard`.
- `FreelancerRoute` (`FreelancerRoute.tsx:12`) same.
- `LoginPage.tsx:83` and `:92`, `SetPasswordPage.tsx:27`, `DefaultRedirect` (`App.tsx:219-223`) all use `roleHomePath`.
- `/account` and `/notifications` stay `ProtectedRoute` (intentional). `MyAccountPage.tsx:40-45` and `NotificationsPage.tsx:25-30` pick `AdminShell` / `FreelancerShell` / `AppShell`.
- Cycle check for the six schema roles (`schema.d.ts:14384`):
  - student @ `/account` is not wrapped in `ConsultancyRoute` → no bounce loop.
  - consultancy staff @ `/dashboard` are allowed.
  - platform roles @ `/admin/dashboard` (`PlatformRoute` with no `permission` prop) are allowed when `platform_permissions` is present (always for `super_admin`; for active `platform_staff` per `platformPermissionsFor`).
  - freelancer @ `/freelancer/dashboard` is allowed.
- Disabled platform staff cannot log in (mock `disabledAccountMessage` + login 403). They never reach the `!permissions → roleHomePath('platform_staff') → /admin/dashboard` bounce. Not a live cycle.

### Honest errors — what passed

Retry targets the same query that failed:

- `SuperAdminDashboardPage.tsx:32` → `dashboard.refetch()`
- `FinanceDashboardPage.tsx:79` → `dashboard.refetch()` (loading skeleton at `:177` and empty copy at `:216-219` still exist when not in the error branch)
- `FormBuilderPage.tsx:109-113` → `existing.refetch()`; editor does not mount on load failure
- `ClientConversationPage.tsx:77-78`, `LeadConversationPage.tsx:444-445`, `InternalMessagingPage.tsx:180-181`, `FloatingChatWindow.tsx:140` → `messages.refetch()`
- `GlobalSearch.tsx:108-116` keeps Searching / error / no-matches as three states
- `GlobalChatDrawer.tsx:80` → `refetch()` on `['conversations']`

### Polling — what passed

- Only caller of `useConversations` is `GlobalChatDrawer.tsx:30` with `open`. `enabled: isAuthed` still fetches once for `unread_count`.
- `CourseFinderPage.tsx:66-88` + `courseFinder.ts:111`: no `GET /courses` on a bare mount (`DEFAULT_STATE`).

### Support tool — what passed

`supportTools.ts:75-80`. Support Tools itself only shows `useUserSearch` + `useAdminConsultancies` (the consultancy list does not change when a journey moves). Prefix invalidation of `['clients']` covers `['clients', journeyId, …]`.

---

## Correction to pass 1

**H7 in `FRONTEND_REVIEW.md` is wrong.** `invalidateQueries({ queryKey: ['clients'] })` is a **prefix** match in TanStack Query v5 (no `exact: true`). `useSetClientTags` / `useUpdateClientDetails` / `useSetClientBranch` / `useSetFinalizedCountry` already invalidate `['clients', id]` and nested client keys. The profile-stale-after-tag-edit failure described in pass 1 does not follow from this code.

---

## New findings

### High

#### N1 — 401 session teardown still leaves the React Query cache

**Where:** `web/src/api/client.ts:87-88`, `:97-98`, `:105` vs `web/src/components/SidebarShell.tsx:75-78`

The logout **button** now clears the query cache. The interceptor that actually ends most sessions (refresh failure / replay still 401) only empties Zustand.

**Failure:** Consultant A has `/clients` in cache (`staleTime` 30s, `main.tsx`). Token expires, refresh fails, interceptor `clear()`s the store. `ProtectedRoute` sends them to `/login`. Consultant B logs in in the **same tab** within 30s. `useClients` finds A’s list still fresh and renders it until something else invalidates.

**Fix:** Export the `QueryClient` (or a `onSessionEnded()` helper used by both `SidebarShell` and the interceptor) and `queryClient.clear()` on every `clear()`. Optionally `navigate('/login')` from the interceptor so the shell does not sit on a 401 error flash.

---

### Medium

#### N2 — `student` on `/account` still mounts consultancy `AppShell`

**Where:** `web/src/features/auth/MyAccountPage.tsx:40-45`, `NotificationsPage.tsx:25-30`; `roleHome.ts:15-19` documents that students can authenticate here.

`roleHomePath('student')` correctly avoids a `/dashboard` loop. The shell picker’s fallback is still `AppShell`, whose sections are Lead Pool, Clients, Administration, etc.

**Failure:** A student signs in on this origin (one identity system). They land on `/account` with the full consultancy nav. Clicks bounce back to `/account` via `ConsultancyRoute`, so there is no data leak if the API 403s, but they are shown another role’s IA and can keep clicking it.

**Fix:** Fourth shell (account-only chrome) or treat `student` like freelancer: a tiny `SidebarShell` with Account + Notifications only.

---

#### N3 — Notification bell dropdown lost its loading state

**Where:** `web/src/components/NotificationsDropdown.tsx:19-64`

Preview fetch is `useNotifications({ enabled: open })`. The H10 patch added `isError` but not `isLoading`. On open: `isError === false`, `items === []`.

**Failure:** User opens the bell. Until `GET /notifications` returns, the menu says **“No notifications yet.”** Then rows appear. A failed fetch is now honest; a slow fetch looks empty. No Retry on error either.

**Fix:** If `isLoading` (and no data), show a short skeleton. On error, Retry → `refetch()`. Keep “No notifications yet” only when `data` arrived and `items.length === 0`.

---

#### N4 — Chat drawer treats first paint as empty

**Where:** `web/src/components/GlobalChatDrawer.tsx:30`, `:75-85`

`useConversations` data is used as `data?.items ?? []`. `isLoading` is never read. `isError` is handled.

**Failure:** User logs in and clicks Chats before the mount fetch lands. Drawer shows **“No conversations found.”** then fills in. Same class of bug as N3; less frequent because the query starts on shell mount, not on click.

**Fix:** Branch `isLoading && !data` before the empty copy.

---

#### N5 — Super Admin “Pending Allocation” still maps a failed queue fetch to `0`

**Where:** `web/src/features/super-admin/SuperAdminDashboardPage.tsx:15-16`, `:91-92`

H6 added `dashboard.isError`. The second query, `useApplicantAllocationQueue()`, still does `allocationQueue.data?.length ?? 0`. `isError` is ignored (`isLoading` at least shows `…`).

**Failure:** `GET /applicant-allocation-queue` fails (403 for a flag, or 5xx). Overview stats from `/admin/dashboard` succeeded. The card shows **0** with no error. Operator assumes nobody is waiting.

**Fix:** If `allocationQueue.isError`, show an error/retry on that card (do not use `0`). Do not fail the whole dashboard.

---

#### N6 — Activity “Mark Done” swallows mutation errors and shares one pending flag

**Where:** `web/src/features/dashboard/ActivityPage.tsx:288`, `:376-394`; `web/src/queries/activity.ts:38-47`

`completeTask.isError` is never rendered. `pending={completeTask.isPending}` is passed to **every** `TaskRow`.

**Failure:** Consultant has two due tasks. Clicks Mark Done on task A. **Both** buttons show “Please wait…”. Request 400/403. Buttons return to normal, tasks still Open, **no error copy**. They click again or assume it worked.

**Fix:** Show `completeTask.error.message` near the list. Pass `pending={completeTask.isPending && completeTask.variables === task.id}`.

---

#### N7 — Platform payment declare can double-POST

**Where:** `web/src/features/administration/RecordPlatformPaymentModal.tsx:28-35`; `web/src/queries/commission.ts:19-31`

`handleSubmit` does not guard `recordPayment.isPending`. The Idempotency-Key is `crypto.randomUUID()` **inside** `mutationFn`, so two submits are two keys. `Button loading` disables after the next paint, not before the second `submit` event.

**Failure:** Billing user on Commission Details clicks a due row, amount prefilled, hits Enter twice (or Declare + Enter) before disable. Two `POST /commission/payments` with different idempotency keys → two declared amounts against one case.

**Fix:** `if (recordPayment.isPending) return` in `handleSubmit`. Generate the idempotency key once per modal open (or per user intent), not per `mutationFn` call.

---

### Low

#### N8 — Freelancer referrals error and empty states can both show

**Where:** `web/src/features/freelancer/FreelancerDashboardPage.tsx:91-96` and `:132-136`

On `referrals.isError`, `items` is `[]`, `isLoading` is false. The error card **and** “No referrals yet.” both render.

**Failure:** `GET` freelancer referrals fails. Dashboard shows an error message stacked with a genuine-empty claim.

**Fix:** Gate the empty card on `!referrals.isError`. Add Retry via `referrals.refetch()`.

#### N9 — Sentpo directory “Dormant” badge ignores the 7/90-day filter

**Where:** `web/src/features/super-admin/SentpoUsersPage.tsx:11-16`, `:29-33`

Filter options include 7 / 30 / 90 days. The badge is hardcoded `daysSince > 30`.

**Failure:** Operator sets “No login in 7+ days”. A student last seen 10 days ago is in the list with **no** Dormant badge (only “Never logged in” or a date). They look active next to 31-day rows that are badged.

**Fix:** Badge using the same threshold as `dormantDays` (or drop the badge and let the filter be the only signal).

---

## Not found (in this pass)

- Redirect loop for `student` / `freelancer` / platform / consultancy after login.
- Course Finder fetching on an empty first visit.
- Conversation list polling with the drawer closed.
- Support Tools switch leaving `['clients', journeyId]` or `['dashboard', scope]` stale (prefix match).
- Form Builder save-over-empty-template after a failed GET.
- Chat `Retry` calling the wrong query.
- Id-based client/lead routes rendering another consultancy’s record without a 404/error (API remains the boundary; UI shows `ErrorState` when `useClient` / `useLead` fails).

---

## Suggested order (still small diffs)

1. N1 — session-end helper used by interceptor + logout.  
2. N7 — payment idempotency / pending guard (money).  
3. N6 — Activity complete error + per-row pending.  
4. N5 — allocation card error.  
5. N3 / N4 — loading on bell and chat drawer.  
6. N2 — student chrome.  
7. N8 / N9.
