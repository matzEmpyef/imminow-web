// C1: the raw enum read fine except for walk_in, which needs the hyphen (matches the label
// already used in ImportLeadsModal's Source dropdown). Shared by Lead Pool and the lead
// conversation's Details card (Phase 5, W-DUP-10).
export const LEAD_SOURCE_LABELS: Record<string, string> = {
  referral: 'Referral',
  website: 'Website',
  walk_in: 'Walk-in',
  social: 'Social',
  other: 'Other',
}
