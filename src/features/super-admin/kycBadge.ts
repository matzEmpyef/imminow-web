import type { components } from '@/api/schema'

export type KycState = components['schemas']['KycStatus']['status']

/**
 * Where an account's KYC stands, in words — the ONE map behind the badge on each Manage
 * Consultancies row (`Consultancy.kyc_status`, served on the list since 2026-10-08) and the KYC
 * row inside Manage (`KycStatus.status`), so the two can never word the same state differently.
 */
export const KYC_BADGE: Record<KycState, { label: string; color: 'success' | 'warning' | 'error' | 'secondary' }> = {
  verified: { label: 'KYC verified', color: 'success' },
  pending: { label: 'KYC pending review', color: 'warning' },
  rejected: { label: 'KYC rejected', color: 'error' },
  not_submitted: { label: 'No certificate', color: 'secondary' },
}
