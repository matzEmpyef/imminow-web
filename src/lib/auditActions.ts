/**
 * Names for audit-log actions whose wire value does not read well when it is only title-cased.
 * Both audit logs (the consultancy's and the platform's) spell an action by title-casing its
 * snake_case value; an action listed here gets these words instead, so the two logs agree.
 *
 * The three from the money-correctness round (2026-10-08): a consultancy asking to void an
 * installment whose share is already due, Finance declining that, and Finance marking a due as
 * fully paid by writing off a small difference.
 */
const AUDIT_ACTION_LABELS: Record<string, string> = {
  installment_void_requested: 'Instalment Void Requested',
  installment_void_declined: 'Instalment Void Declined',
  due_settled: 'Due Marked Fully Paid',
}

/** The label for an action that has its own words; undefined for one that is simply title-cased. */
export function auditActionLabel(action: string): string | undefined {
  return AUDIT_ACTION_LABELS[action]
}
