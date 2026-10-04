import { describe, expect, it } from 'vitest'
import type { components } from '@/api/schema'
import { buildAppConfigPatch, compareVersions, minimumRaised } from './appConfigPatch'

type AppConfig = components['schemas']['AppConfig']

const saved: AppConfig = {
  latest_version: '1.4.0',
  minimum_version: '1.0.0',
  update_url: 'https://play.google.com/store/apps/details?id=com.sentpo.app',
  update_url_android: 'https://play.google.com/store/apps/details?id=com.sentpo.app',
  update_url_ios: null,
  release_notes: 'Faster search.',
  rating: { min_days_since_install: 3, min_sessions: 5, cooldown_days: 30 },
}

describe('buildAppConfigPatch (gate 12c, F64)', () => {
  it('sends an empty body when nothing changed', () => {
    expect(buildAppConfigPatch({ ...saved }, saved)).toEqual({})
  })

  it('sends only the changed fields, with a partial rating', () => {
    const form = { ...saved, release_notes: 'New.', rating: { ...saved.rating, min_sessions: 8 } }
    expect(buildAppConfigPatch(form, saved)).toEqual({ release_notes: 'New.', rating: { min_sessions: 8 } })
  })

  it('carries the reason only when the minimum rises', () => {
    const raised = { ...saved, minimum_version: '1.2.0' }
    expect(buildAppConfigPatch(raised, saved, { reason: ' Security fix ' })).toEqual({
      minimum_version: '1.2.0',
      reason: 'Security fix',
    })
    const lowered = { ...saved, latest_version: '1.5.0' }
    expect(buildAppConfigPatch(lowered, saved, { reason: 'ignored' })).toEqual({ latest_version: '1.5.0' })
  })

  it('adds force with the reason on the re-submit', () => {
    const raised = { ...saved, minimum_version: '1.4.0' }
    expect(buildAppConfigPatch(raised, saved, { reason: 'Old builds are insecure', force: true })).toEqual({
      minimum_version: '1.4.0',
      reason: 'Old builds are insecure',
      force: true,
    })
  })

  it('clears a saved store link with null and leaves an untouched one out', () => {
    const form = { ...saved, update_url_android: '  ', update_url_ios: '' }
    expect(buildAppConfigPatch(form, saved)).toEqual({ update_url_android: null })
  })

  it('leaves a blank platform link out when the server never sent the field (frozen mock)', () => {
    const { update_url_android: _a, update_url_ios: _i, ...mockSaved } = saved
    const form: AppConfig = { ...mockSaved, update_url_android: '', update_url_ios: '' }
    expect(buildAppConfigPatch(form, mockSaved)).toEqual({})
  })

  it('compares versions numerically', () => {
    expect(compareVersions('1.10.0', '1.9.0')).toBeGreaterThan(0)
    expect(minimumRaised({ ...saved, minimum_version: '1.0.1' }, saved)).toBe(true)
    expect(minimumRaised({ ...saved, minimum_version: '0.9.0' }, saved)).toBe(false)
  })
})
