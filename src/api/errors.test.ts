import { describe, expect, it } from 'vitest'
import { ApiError } from './errors'

// The one constructor change (2026-08-25) that made all ~270 throw sites surface the server's own
// denial text. If someone "simplifies" this back to a bare Error, permission denials become
// indistinguishable from network failures again — the exact regression the audit flagged.
describe('ApiError', () => {
  it("prefers the server's message over the caller's fallback", () => {
    const err = new ApiError('Could not load commission details.', {
      error: { code: 'forbidden', message: 'This action requires the billing.view_commission_details permission', request_id: 'req-1' },
    })
    expect(err.message).toBe('This action requires the billing.view_commission_details permission')
    expect(err.code).toBe('forbidden')
    expect(err.requestId).toBe('req-1')
    expect(err.name).toBe('ApiError')
    expect(err).toBeInstanceOf(Error)
  })

  it('falls back to the generic text when the body has no usable message', () => {
    expect(new ApiError('Could not load X.', undefined).message).toBe('Could not load X.')
    expect(new ApiError('Could not load X.', {}).message).toBe('Could not load X.')
    expect(new ApiError('Could not load X.', { error: {} }).message).toBe('Could not load X.')
    expect(new ApiError('Could not load X.', { error: { message: '   ' } }).message).toBe('Could not load X.')
    expect(new ApiError('Could not load X.', 'not an envelope').message).toBe('Could not load X.')
  })

  it('trims the server message and leaves code/requestId undefined when absent', () => {
    const err = new ApiError('fallback', { error: { message: '  Lead not found.  ' } })
    expect(err.message).toBe('Lead not found.')
    expect(err.code).toBeUndefined()
    expect(err.requestId).toBeUndefined()
  })
})
