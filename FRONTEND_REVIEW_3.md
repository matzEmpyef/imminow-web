# immiNow web frontend — third-pass review

**Date:** 1 September 2026  
**Scope:** `web/` after the N1–N9 batch. Prior passes: [`web/FRONTEND_REVIEW.md`](web/FRONTEND_REVIEW.md), [`web/FRONTEND_REVIEW_2.md`](web/FRONTEND_REVIEW_2.md).  
**Method:** Read-only. Every item is checked against the current source. Known deferred decisions (Cognito session model, mock-only behaviour, tests, i18n, a11y pass, god-file splits, Google/2FA placeholders, DOMPurify/deep-link allowlists) are not re-reported. Pass 1 / pass 2 findings are not restated unless a listed item is wrong or a fix introduced a new bug.

None of the nine listed fixes is wrong. None introduced a new bug. N7’s *follow-up check* (other money / idempotent mutations) is where the new High items live.

---

## Regression checks (N1–N9)

| ID | Result | Notes |
|---|---|---|
| **N1** | **PASS** | Shared `endSession()`; all three interceptor teardowns + logout; no import cycle; retry still skips `ApiError`; no leftover bare session `clear()`. |
| **N7** | **PASS** | Payment modal: `isPending` guard + one UUID per open. Other `Idempotency-Key` sites still mint per attempt — see new findings, not a half-applied payment fix. |
| **N6** | **PASS** | Complete-task error copy + per-row pending via `variables === task.id`. |
| **N5** | **PASS** | Allocation card has its own error+retry; `0` is not shown on error; dashboard query stays independent. |
| **N3 / N4** | **PASS** | Bell and chat drawer: loading before empty; error+Retry kept. |
| **N2** | **PASS** | Students get `AccountShell` on `/account` and `/notifications`. Other student-reachable URLs bounce via `ConsultancyRoute` before a staff shell mounts. |
| **N8** | **PASS** | Empty copy gated on `!isError`; Retry wired. |
| **N9** | **PASS** | Dormant threshold follows the 7/30/90 filter; default 30 on “Any activity”. |

### N1 — what passed

`web/src/lib/session.ts:15-18` is the only session teardown: store `clear()` + `queryClient.clear()`. Callers:

- `web/src/components/SidebarShell.tsx:75` (`handleLogout`, after fire-and-forget `POST /auth/logout`)
- `web/src/api/client.ts:92`, `:102`, `:109` (refresh gave up / replay threw / replay still 401)

`QueryClient` lives in `web/src/lib/queryClient.ts`. Retry is unchanged: `!(error instanceof ApiError) && failureCount < 2` (`queryClient.ts:23`). `ApiError` is a leaf in `web/src/api/errors.ts` and is re-exported from `queries/auth.ts:8`.

Import graph (no cycle):

```
api/client → lib/session → lib/queryClient → api/errors
lib/session → stores/authStore
queries/auth → api/client + api/errors
```

Grep: no `queryClient.clear()` and no `getState().clear()` outside `session.ts`.

**In-flight after `endSession`:** TanStack Query v5 `QueryCache.remove` → `query.destroy()` → `cancel({ silent: true })`. Completing fetches do not write the previous account back into the cache. Not a regression.

### N7 — what passed

`web/src/features/administration/RecordPlatformPaymentModal.tsx:32` mints the key once (`useState(() => crypto.randomUUID())`). `handleSubmit` returns while `recordPayment.isPending` (`:36`). `useRecordCommissionPayment` takes the caller’s key (`web/src/queries/commission.ts:24-34`).

Remaining `crypto.randomUUID()` inside `mutationFn` (not money-declare, not this fix): `useCommitLeadImport`, `useBulkAllocateLeads`, `useProposeConversion` (`leads.ts:121`, `:214`, `:329`), `useAssignPlan` (`plans.ts:44`), `useCreateConsultancy` (`adminConsultancies.ts:37`), `useImportColleges` (`adminColleges.ts:137`). Invoice/receipt `POST`s have **no** `Idempotency-Key` in the generated types. Those are new findings below.

### N6 — what passed

`web/src/features/dashboard/ActivityPage.tsx:290-298`: `completeTask.isError` renders `completeTask.error.message`; `pending={completeTask.isPending && completeTask.variables === task.id}`. `mutate(task.id)` so `variables` is that id.

### N5 — what passed

`web/src/features/super-admin/SuperAdminDashboardPage.tsx:94-111`: queue `isError` shows copy + Retry with `stopPropagation` (card still navigates on the rest of the click). The count/`…` branch is only when the queue is not in error. Dashboard `useQuery` is separate.

### N3 / N4 — what passed

`NotificationsDropdown.tsx:63-74`: error+Retry, then `!isError && isLoading` → “Loading…”, then empty. Rows only when `!isError`.

`GlobalChatDrawer.tsx:75-89`: error+Retry first, then `isLoading && !data`, then empty. Error state was not dropped.

### N2 — what passed

`AccountShell.tsx:12-34`: My Account + Notifications only. `MyAccountPage.tsx:42-49` and `NotificationsPage.tsx:26-33` pick `AccountShell` when `role === 'student'`.

Student routes in `App.tsx` are `/account` and `/notifications` (`ProtectedRoute`). Every consultancy page is wrapped in `ConsultancyRoute` (`ConsultancyRoute.tsx:17`), which bounces non-admin/consultant roles to `roleHomePath` → `/account` **before** the lazy page (and its `AppShell` / `FeatureGate` `AppShell`) mounts. Deep link `/clients/:id` does not render a staff shell.

`FeatureGate` / `PermissionGate` still wrap with `AppShell`; those gates only sit inside `ConsultancyRoute`, so a student never reaches them.

### N8 — what passed

`FreelancerDashboardPage.tsx:91-99` Retry; `:139` empty gated `!referrals.isLoading && !referrals.isError && items.length === 0`.

### N9 — what passed

`SentpoUsersPage.tsx:20-37`, `:88`: `dormantAfterDays={dormantDays ? Number(dormantDays) : 30}`. Filter `dormant_days` and badge threshold stay in lockstep; “Any activity” (`''`) still uses 30.

---

## New findings

### High

#### T1 — Create Invoice and Record Payment can double-POST (no pending guard, no idempotency header)

**Where:** `web/src/features/clients/InvoicesPage.tsx:41-47`; `web/src/features/clients/ReceiptsPage.tsx:23-26`; `web/src/queries/invoicing.ts:45-59`, `:112-121`

Same failure class N7 fixed for platform commission declare. `handleSubmit` does not return on `isPending`. `Button loading` only disables after the next paint. Enter-Enter (or Create + Enter) in the amount field fires two `mutate`s.

`POST /invoices` and `POST /receipts` in `schema.d.ts` have `header?: never` — the client cannot send `Idempotency-Key` even though the shared header description in `openapi.yaml` lists **invoice creation** among TRD Section 7 idempotent money operations. Two submits are two invoices / two receipts.

**Failure:** Billing user opens Create Invoice, picks an applicant, fills one line, hits Enter twice before “Please wait…”. Two invoices for the same line items. On Receipts, two recorded payments against one invoice.

**Fix:** `if (createInvoice.isPending) return` / `if (createReceipt.isPending) return` in `handleSubmit`. If the contract grows the header on those POSTs, mint one key per modal open (N7 pattern). Until then the pending guard is the only protection.

---

#### T2 — Invoice, receipt, library, and allocate pickers silently stop at the default page of 20

**Where:**

- `web/src/features/clients/InvoicesPage.tsx:28`, `:71-76` — `useClients()` with no `limit`, SearchSelect over `clients.data?.items`
- `web/src/features/clients/ReceiptsPage.tsx:18`, `:29` — `useInvoices()` with no `limit`; dropdown is that first page minus voids
- `web/src/features/administration/DocumentLibraryPage.tsx:124-134` — `useClients()` with no `limit`; share menu uses that list
- `web/src/queries/staff.ts:12-22` — `useEmployees()` with no `limit`; Lead Pool allocate (`LeadPoolPage.tsx:52`, `:68-70`) and Subscription seat count (`ConsultancyProfilePage.tsx:542`) read `items`

`LimitParam` default is **20**, max 100 (`openapi.yaml:117-125`). Pass 1 **M20** was the Course Finder / Assign Task hook, which already passes `limit: 100`. These call sites never got that (or server-backed search).

The mock `GET /staff/employees` returns the full set (`mock-server/server.js:3547-3555`) and so hides the employee/seat variant in mock QA. `GET /clients` and `GET /invoices` are paginated on both mock and contract.

**Failure:** Consultancy with 21 applicants. Create Invoice search cannot find applicant 21 — they cannot bill them from this modal. Receipts cannot record against invoice 21. Document Library cannot share with applicant 21. Against a real paginated employees API: cannot allocate to staff member 21; Subscription shows “20 / N seats” when 21 people actually hold seats.

**Fix:** Same as M20 for every “complete set” picker: `limit: 100` at minimum, and/or typeahead that hits `search`. Seat usage should use `meta.total`, not `items.length`.

---

#### T3 — Lead CSV commit can import the same batch twice

**Where:** `web/src/features/sales/ImportLeadsModal.tsx:39-42`, `:54`; `web/src/queries/leads.ts:113-128`

`handleCommit` does not guard `commit.isPending`. The Idempotency-Key is `crypto.randomUUID()` inside `mutationFn`, so two clicks are two operations. `Button loading` disables after paint, not before the second click.

**Failure:** Consultant validates a 400-row CSV, double-clicks “Import 400 Leads”. Two `POST /leads/import/commit` with different keys. Up to 800 leads (or a 409 on the second call with an error after the first already committed — `isSuccess` is then false and the modal looks like a failure of a successful import).

**Fix:** N7 pattern: `if (commit.isPending) return`; mint the key once per modal open (or per `batch_id`) and pass it into the mutation.

---

### Medium

#### T4 — Plan tab treats any plan GET failure as “no plan assigned”

**Where:** `web/src/features/clients/ClientProfilePage.tsx:321-336` (`PlanTab`); contrast `web/src/components/PlanStepBuilder.tsx:401-403`

`GET /clients/{id}/plan` 404 means no plan (mock `server.js:6084`, message “No plan assigned yet.”). `usePlan` throws on any error (`plans.ts:31`, `retry: false`). `PlanTab` maps `plan.isError || !plan.data` to the empty card **and** “Assign a Plan”.

`PlanStepBuilder` already has `ErrorState` + Retry for that query. `PlanTab` never mounts it on error, so that Retry is dead code on this page.

Overview uses `client.plan_template_name` (`ClientProfilePage.tsx:258-275`), not `usePlan`. Activity deep-links land on Plan (`ActivityPage.tsx:114`, `:179`).

**Failure:** Client is `in_plan`. `GET /plan` 500/403. Overview still shows the template name and progress. Plan tab says **“No plan assigned yet.”** with Assign. The consultant cannot review the submitted step; they may try to assign a second plan. Refreshing the Activity `?tab=Plan&step=` link shows the same empty state — no Retry.

**Fix:** If `plan.isError` and the code is not the documented empty 404, show `ErrorState` + `plan.refetch()`. Keep the assign card only for the empty-plan case.

---

#### T5 — Client Profile tab (and step) live only in component state — refresh mid-flow returns to Overview

**Where:** `web/src/features/clients/ClientProfilePage.tsx:1162-1182`, `:1310-1325`

`activeTab` is initialized once from `?tab=`. Clicking a tab calls `setActiveTab` and **does not write the URL**. `PlanStepBuilder` similarly snapshots `initialStepId` on mount (`PlanStepBuilder.tsx:387-389`).

Activity links (`?tab=Plan&step=…`) survive a reload. Every in-page tab click does not.

**Failure:** Consultant is on Plan, previewing a step, hits refresh (or the chunk reloads). URL is `/clients/:id` with no query. Page remounts on **Overview**. Back/forward does not restore Plan either. Same for Forms / Commissions / Documents after a deep session.

**Fix:** Keep `tab` (and `step` while on Plan) in the search string when the user changes tabs, or read `searchParams` on every render instead of a mount-only initializer.

---

#### T6 — KYC card treats loading and error as “not submitted”

**Where:** `web/src/features/administration/ConsultancyProfilePage.tsx:478-522`

`status = kyc.data?.status ?? 'not_submitted'`. `kyc.isLoading` and `kyc.isError` are never read. Upload + Submit render in all three states.

Super Admin `KycSection` (`ManageConsultanciesPage.tsx:234-238`) at least falls back to `consultancy.kyc_verified` when the detail fetch fails. The consultancy’s own card does not.

**Failure:** `GET /consultancies/me/kyc` is slow or fails. Admin sees **“Upload your registration certificate”** and a Submit button, as if they had never sent one. They re-upload; the server resets verification (comment at `:475-476`). A verified consultancy briefly (or until retry) looks unverified and can kick itself back to pending.

**Fix:** Loading skeleton; on `isError`, `ErrorState` + `kyc.refetch()`. Do not default status to `not_submitted` until `data` arrives.

---

#### T7 — Document Library upload and share fail silently

**Where:** `web/src/features/administration/DocumentLibraryPage.tsx:215-218`, `:193`; `web/src/queries/documentLibrary.ts:78-96`

Upload: `uploadDocument.mutate(file)` with `loading={uploadDocument.isPending}` only. `uploadDocument.isError` is never rendered.

Share: `onShare` calls `shareDocument.mutate` and `ShareDocumentMenu.handleConfirm` (`ShareDocumentMenu.tsx:32-35`) closes the modal immediately. No error surface on the page.

**Failure:** Upload 413/400. Button returns to “Upload Document”; the file is not in the table; no message. Share 409 “already shared” (the mutation is written to surface that string) — modal already closed, consultant assumes it worked; applicant Documents tab unchanged.

**Fix:** Render `uploadDocument.error` / `shareDocument.error` on the page. Keep the share modal open until `onSuccess`.

---

#### T8 — Remaining Idempotency-Key mutations still mint a new key per attempt (convertible / assign-plan / bulk allocate / create consultancy)

**Where:** `web/src/queries/leads.ts:329` + `ConvertToClientModal.tsx:41`; `web/src/queries/plans.ts:44` + `AssignPlanModal.tsx:30-33`; `web/src/queries/leads.ts:214` + `AssignConsultantMenu.tsx:45-48`, `:86`; `web/src/queries/adminConsultancies.ts:37` + `CreateConsultancyModal.tsx:44-60`

N7’s payment path is fixed. These still generate the key inside `mutationFn`. None of the click/submit handlers return on `isPending` (`AssignConsultantMenu` Confirm is not even `loading=`). Convert’s contract has Idempotency-Key (`openapi.yaml:11660`); student-side convert documents 400 if a proposal already exists (`:11679`) — consultant convert does not list 400 in the generated `POST /leads/{id}/convert` responses, so a double send is not guaranteed to collapse.

**Failure:** Double-click “Send Proposal” before disable: two keys, two `POST /leads/{id}/convert`. Double-click “Assign This Plan”: two assign calls. Rapid Confirm on bulk allocate: two bulk POSTs. Enter-Enter on Create Consultancy: two consultancies.

**Fix:** Same as N7: stable key per dialog open; `if (isPending) return` (and `loading` on AssignConsultantMenu Confirm).

---

### Low

#### T9 — Quiz admin list has no table `error=`

**Where:** `web/src/features/super-admin/QuizAdminPage.tsx:1027-1036`

Leaderboard inside a quiz has `error=` (`:762`). The page-level `useAdminEvents('quiz')` table does not. Failed list fetch renders “No quizzes yet.”

This is the H10 pattern on a page pass 1 did not list. Lower impact than invoices (T1) because no money moves; still a false empty on the authoring screen this pass was asked to cover.

**Fix:** `error={events.isError ? 'Could not load quizzes.' : undefined}` and do not show the empty copy on error.

---

## Not found (this pass)

- N1–N9 half-applied or broken.
- `endSession()` leaving in-flight GET results in the cache (`Query.destroy` cancels).
- Student mounting `AppShell` / `FeatureGate` chrome (bounce happens first).
- Import cycle after the `ApiError` / `queryClient` move.
- Retry policy treating `ApiError` as retryable.
- Branches page missing `error=` (it has one: `BranchesPage.tsx:166`).
- Lazy-chunk failure with no recovery: `App.tsx` `Suspense` sits under `AppErrorBoundary`; Reload is the recovery.
- Step-review buttons shown to callers without `step_review.confirm_send_back` (`PlanStepBuilder.tsx:81-94`).
- Pass 1 **H7** remains wrong (prefix invalidation); nothing in this batch revived it.

---

## Suggested order

1. **T1** — invoice/receipt double-submit (money, same patch as N7).  
2. **T3** — CSV commit double-import.  
3. **T2** — 20-row pickers (billing + share + allocate/seats).  
4. **T4** — Plan tab error vs empty.  
5. **T6 / T7** — KYC and library honest errors.  
6. **T8** — remaining per-attempt idempotency keys.  
7. **T5** — tab query-string (refresh mid-flow).  
8. **T9** — quiz list error.
