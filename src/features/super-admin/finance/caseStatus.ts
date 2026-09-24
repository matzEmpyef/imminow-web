// A commission case's payment status, as the Cases tab and the consultancy balance drawer both
// show it (Phase 5 cleanup, 2026-09-24 — the two carried identical copies).
export const CASE_STATUS_COLOR = {
  unpaid: 'warning',
  part_paid: 'info',
  paid: 'success',
  not_due: 'secondary',
  closed: 'secondary',
} as const
export const CASE_STATUS_LABEL = {
  unpaid: 'Unpaid',
  part_paid: 'Part-paid',
  paid: 'Paid',
  not_due: 'Not due yet',
  // The remaining due was closed off without ever being collected (2026-09-12, product review H2).
  closed: 'Closed — not collected',
} as const
