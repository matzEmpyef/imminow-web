import { renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

// The registry is hand-mirrored against mock-server/server.js's FEATURE_REGISTRY (there is no
// shared package). These assertions are the client half of keeping the two honest: a duplicated
// or mis-tiered key here would silently gate the wrong thing.
vi.mock('@/queries/consultancy', () => ({ useMyConsultancy: vi.fn() }))

import { useMyConsultancy } from '@/queries/consultancy'
import { BUSINESS_FEATURES, FEATURE_KEYS, FEATURE_REGISTRY, STARTER_FEATURES, ULTIMATE_FEATURES, useFeature, useFeatures } from './features'

const mockedConsultancy = vi.mocked(useMyConsultancy)

describe('FEATURE_REGISTRY', () => {
  it('has unique keys, each with a tier, label and description', () => {
    expect(new Set(FEATURE_KEYS).size).toBe(FEATURE_REGISTRY.length)
    for (const f of FEATURE_REGISTRY) {
      expect(['starter', 'business', 'ultimate']).toContain(f.tier)
      expect(f.label.length).toBeGreaterThan(0)
      expect(f.description.length).toBeGreaterThan(0)
    }
  })

  it('partitions cleanly into the Starter, Business and Ultimate bundles', () => {
    // The three bundles have to cover the registry BETWEEN them: every screen that lists flags
    // (the Subscription tab, Manage Consultancies' toggle panel) walks these, so a flag in none of
    // them is a flag a Super Admin cannot see or switch. That is exactly what happened when
    // `multi_branch` moved to Starter on 2026-09-21 and only two bundles existed.
    expect(STARTER_FEATURES.length + BUSINESS_FEATURES.length + ULTIMATE_FEATURES.length).toBe(
      FEATURE_REGISTRY.length,
    )
    expect(STARTER_FEATURES.every((f) => f.tier === 'starter')).toBe(true)
    expect(BUSINESS_FEATURES.every((f) => f.tier === 'business')).toBe(true)
    expect(ULTIMATE_FEATURES.every((f) => f.tier === 'ultimate')).toBe(true)
  })

  it('carries multi_branch at STARTER, not Ultimate (product owner, 2026-09-21)', () => {
    // Branches are marketplace presence — a student picks which branch of a consultancy to talk
    // to — so every account has them. Pinned because this exact key was the one the console and
    // the server had to be moved in step, and a silent revert here would re-lock the Branches page
    // for every Starter and Business account while the API kept answering.
    expect(FEATURE_REGISTRY.find((f) => f.key === 'multi_branch')?.tier).toBe('starter')
  })

  it('still carries the thirteen flags the server gates on (build reference 1.16)', () => {
    expect(FEATURE_KEYS.sort()).toEqual(
      [
        'own_leads', 'create_applicant', 'designations', 'tags', 'allocation_rule', 'phonebook',
        'document_library', 'case_reopening', 'audit_log',
        'activity_queue', 'internal_messaging', 'multi_branch', 'applicant_transfer',
      ].sort(),
    )
  })
})

describe('useFeatures / useFeature', () => {
  function consultancyState(overrides: Partial<ReturnType<typeof useMyConsultancy>>) {
    mockedConsultancy.mockReturnValue({ data: undefined, isLoading: false, isError: false, ...overrides } as ReturnType<typeof useMyConsultancy>)
  }

  it('reads the resolved features map off the consultancy — never the tier enum', () => {
    consultancyState({ data: { tier: 'starter', features: { phonebook: true, audit_log: false } } as never })
    const { result } = renderHook(() => useFeature('phonebook'))
    expect(result.current).toBe(true)
    const { result: audit } = renderHook(() => useFeature('audit_log'))
    expect(audit.current).toBe(false)
  })

  it('fails closed while loading and on error — every key reads false', () => {
    consultancyState({ isLoading: true })
    expect(renderHook(() => useFeature('phonebook')).result.current).toBe(false)

    consultancyState({ isError: true })
    const { result } = renderHook(() => useFeatures())
    expect(result.current.data).toEqual({})
    expect(result.current.isError).toBe(true)
  })

  it('treats a missing features map as nothing enabled rather than throwing', () => {
    consultancyState({ data: { tier: 'ultimate' } as never })
    expect(renderHook(() => useFeature('multi_branch')).result.current).toBe(false)
  })
})
