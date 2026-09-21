import { useMyConsultancy } from '@/queries/consultancy'

// Subscription tiers made real (build reference 1.16, 2026-08-29). Starter is the always-on
// core — every one of these ships on every tier and is never toggleable, so it has no flag and
// isn't part of this registry:
//
//   marketplace listing/discovery + ratings + KYC · Lead Pool (Sentpo leads) + allocation ·
//   Active Leads + lead chat + lead close · convert to client · Clients list + full
//   single-client servicing (plan builder/steps/step review, client chat, Selected Colleges +
//   Accept flow) · commissions everywhere · Invoices + Receipts · Forms · Course Finder ·
//   Plan Templates · Course Suggestions · Employees simple mode (seat-limited) ·
//   Consultancy Management · dashboard · notifications · global search/chat.
//
// Branches used to be in that list as "single branch". Since 2026-09-21 they are a Starter FLAG
// (`multi_branch`) rather than unflagged core — on for everyone by default, but still switchable
// off per tenant by a Super Admin, which is what a flag buys.
//
// Everything below is a toggleable flag. This is the SINGLE exported source every consumer reads
// from — AppShell's nav gating, the Manage Consultancy toggle panel, and the Subscription tab's
// feature lists all derive from this one array, so the three no longer disagree the way the old
// hand-maintained copies did (a dead 5-key ENTITLEMENT_FLAGS list, ManageConsultanciesPage's own
// 5-key list, and ConsultancyProfilePage's prose TIER_FEATURES).
//
// Mirrors `FEATURE_REGISTRY` in mock-server/server.js exactly — there is no shared-package
// boundary between the mock server and this client, so keep the two lists in sync by hand.
// 'starter' joined the tier union on 2026-09-21, when `multi_branch` moved down to it. A Starter
// flag is ON for every account by default; it stays a REGISTERED flag rather than joining the
// unflagged Starter core below so a Super Admin can still switch it off for one tenant.
export type FeatureTier = 'starter' | 'business' | 'ultimate'

export interface FeatureDef {
  key: string
  tier: FeatureTier
  label: string
  description: string
}

export const FEATURE_REGISTRY: FeatureDef[] = [
  // --- Starter (default ON for every account) ---
  // Moved down from Ultimate on 2026-09-21 (product owner: "branches are marketplace presence and
  // every account has one anyway; Ultimate gets new features later"). A student now picks which
  // BRANCH of a consultancy to talk to and sees the nearest first, so holding the Branches page
  // behind Ultimate held an account's own shop front — and the address students are matched
  // against — behind Ultimate.
  { key: 'multi_branch', tier: 'starter', label: 'Branches', description: 'The Branches page and each branch’s location, branch pickers on leads and clients, and the dashboard branch breakdown. Included on every plan.' },
  // --- Business bundle (default ON at business+, 15 seats) ---
  { key: 'own_leads', tier: 'business', label: 'Add Lead + Import Leads', description: 'Manually add a lead or bulk-import from CSV — leads from your own channels, not just Sentpo.' },
  { key: 'create_applicant', tier: 'business', label: 'Create Applicant', description: 'Create an applicant record manually, without a Sentpo lead behind it.' },
  { key: 'designations', tier: 'business', label: 'Designations & Access Rights', description: 'Designations page, granular permission overrides, and invite-time access rights — includes roster scoping (view own vs. view all). Admins always see everything, on every tier.' },
  { key: 'tags', tier: 'business', label: 'Tag Management', description: 'Create and manage tags, and apply them to leads and clients.' },
  { key: 'allocation_rule', tier: 'business', label: 'Auto-Assign Rule', description: 'Automatic lead allocation rule for the Lead Pool.' },
  { key: 'phonebook', tier: 'business', label: 'Phonebook', description: "Your consultancy's shared contact book." },
  { key: 'document_library', tier: 'business', label: 'Document Library', description: 'A reusable pool of common documents, shareable straight into a client file.' },
  { key: 'case_reopening', tier: 'business', label: 'Reopening', description: 'Reopen a closed lead, a closed case, or a completed plan.' },
  { key: 'audit_log', tier: 'business', label: 'Audit Log', description: 'Full change history across leads, clients, and staff.' },
  // --- Ultimate bundle (default ON at ultimate only, 50 seats) ---
  { key: 'activity_queue', tier: 'ultimate', label: 'Activity Work-Queue', description: 'The Activity page — tasks, lead reminders, and the sidebar action-needed badge.' },
  { key: 'internal_messaging', tier: 'ultimate', label: 'Internal Messaging', description: 'Direct messages and the Team channel between your own colleagues.' },
  { key: 'applicant_transfer', tier: 'ultimate', label: 'Applicant Transfer', description: "Transfer a client out to another consultancy. (Accepting an incoming transfer is the OTHER consultancy's feature and always stays open.)" },
]

export const FEATURE_KEYS = FEATURE_REGISTRY.map((f) => f.key)

export const STARTER_FEATURES = FEATURE_REGISTRY.filter((f) => f.tier === 'starter')
export const BUSINESS_FEATURES = FEATURE_REGISTRY.filter((f) => f.tier === 'business')
export const ULTIMATE_FEATURES = FEATURE_REGISTRY.filter((f) => f.tier === 'ultimate')

// Starter-core bullet copy for the Subscription tab — display-only prose, not flags. Kept here so
// it lives beside the flags it's the counterpart to. Since 2026-09-21 Starter also has a real flag
// (`multi_branch`), so "single branch" left this list: it is no longer true, and the flag's own
// label now carries branches wherever the enabled features are listed.
export const STARTER_CORE_FEATURES = [
  'Marketplace listing, discovery & ratings, KYC',
  'Lead Pool (Sentpo leads) + allocation',
  'Active Leads, lead chat & close',
  'Convert to client',
  'Full client servicing — plan, steps, chat, Selected Colleges',
  'Commissions, Invoices & Receipts',
  'Forms — templates, builder & client Forms tab',
  'Course Finder, Plan Templates, Course Suggestions',
  'Employees (simple mode, seat-limited)',
  'Consultancy Management, dashboard',
]

export const TIER_LABEL: Record<string, string> = { starter: 'Starter', business: 'Business', ultimate: 'Ultimate' }
export const TIER_ORDER = ['starter', 'business', 'ultimate'] as const

export type Features = Record<string, boolean>

/**
 * The resolved feature map — tier preset merged with any Super Admin overrides, exactly as the
 * server computes it. Every consumer should gate on THIS, never on the raw `tier` enum, since a
 * per-flag override can grant or withhold a feature independent of tier.
 *
 * Fails closed: while loading, or if the consultancy fetch failed, every key reads false. That's
 * correct for hiding a nav link or a button; a caller that needs to distinguish "still loading"
 * from "genuinely off" should read `useMyConsultancy()` itself instead.
 */
export function useFeatures(): { data: Features; isLoading: boolean; isError: boolean } {
  const consultancy = useMyConsultancy()
  return {
    data: (consultancy.data?.features as Features | undefined) ?? {},
    isLoading: consultancy.isLoading,
    isError: consultancy.isError,
  }
}

export function useFeature(key: string): boolean {
  return useFeatures().data[key] === true
}
