import { describe, expect, it } from 'vitest'
import { roleHomePath } from './roleHome'

// Five call sites (DefaultRedirect, the three role-route bounces, LoginPage, SetPasswordPage) all
// derive "which shell does this role get" from here. The student case is the one that bit: a
// student falling through to /dashboard bounced straight back through this function — a loop.
describe('roleHomePath', () => {
  it('sends platform accounts to the admin console', () => {
    expect(roleHomePath('super_admin')).toBe('/admin/dashboard')
    expect(roleHomePath('platform_staff')).toBe('/admin/dashboard')
  })

  it('sends freelancers to their own dashboard', () => {
    expect(roleHomePath('freelancer')).toBe('/freelancer/dashboard')
  })

  it('sends students to the one page every role owns — never into the consultancy shell', () => {
    expect(roleHomePath('student')).toBe('/account')
    expect(roleHomePath('student')).not.toBe('/dashboard')
  })

  it('defaults consultancy staff (and the unknown case) to the consultancy dashboard', () => {
    expect(roleHomePath('consultant')).toBe('/dashboard')
    expect(roleHomePath(undefined)).toBe('/dashboard')
  })
})
