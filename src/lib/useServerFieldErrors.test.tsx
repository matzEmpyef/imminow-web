import { act, renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { ApiError } from '@/api/errors'
import { useServerFieldErrors } from './useServerFieldErrors'

function refusal(fields: Record<string, string>) {
  return new ApiError('fallback', { error: { code: 'validation_failed', message: 'Check the details.', details: { fields } } }, 400)
}

// Decision 154, ruling 14: the sentence the server names for a field sits beside that field until
// what is typed there changes.
describe('useServerFieldErrors', () => {
  it('gives the sentence for a named field and none for the others', () => {
    const error = refusal({ email: 'That address cannot receive mail.' })
    const { result } = renderHook(() => useServerFieldErrors(error, { email: 'a@b.co', phone: '' }))
    expect(result.current.messageFor('email')).toBe('That address cannot receive mail.')
    expect(result.current.messageFor('phone')).toBeUndefined()
    expect(result.current.allBesideFields).toBe(true)
  })

  it('takes the sentence away once the field is edited, and keeps it for a field not edited', () => {
    const error = refusal({ email: 'No mail.', phone: 'Bad phone.' })
    const { result, rerender } = renderHook(({ values }) => useServerFieldErrors(error, values), {
      initialProps: { values: { email: 'a@b.co', phone: '123' } },
    })
    expect(result.current.messageFor('email')).toBe('No mail.')
    act(() => rerender({ values: { email: 'c@d.co', phone: '123' } }))
    expect(result.current.messageFor('email')).toBeUndefined()
    expect(result.current.messageFor('phone')).toBe('Bad phone.')
  })

  it('does not call the footer redundant when the server names a field the form does not show', () => {
    const error = refusal({ something_else: 'Not on this form.' })
    const { result } = renderHook(() => useServerFieldErrors(error, { email: 'a@b.co' }))
    expect(result.current.allBesideFields).toBe(false)
  })

  it('says nothing for an error that names no field, or no error at all', () => {
    const plain = new Error('plain')
    const { result } = renderHook(() => useServerFieldErrors(plain, { email: 'a' }))
    expect(result.current.messageFor('email')).toBeUndefined()
    expect(result.current.allBesideFields).toBe(false)
    const none = renderHook(() => useServerFieldErrors(null, { email: 'a' }))
    expect(none.result.current.messageFor('email')).toBeUndefined()
  })

  it('looks under an alias too', () => {
    const error = refusal({ new_email: 'Already used.' })
    const { result } = renderHook(() => useServerFieldErrors(error, { email: 'a@b.co' }))
    expect(result.current.messageFor('email', 'new_email')).toBe('Already used.')
  })
})
