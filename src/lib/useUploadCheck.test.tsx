import { act, renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { useUploadCheck } from './useUploadCheck'

const MB = 1024 * 1024

describe('useUploadCheck', () => {
  it('lets a PDF of 15 MB through and keeps no sentence', () => {
    const { result } = renderHook(() => useUploadCheck('document'))
    let ok = false
    act(() => {
      ok = result.current.check({ type: 'application/pdf', size: 15 * MB })
    })
    expect(ok).toBe(true)
    expect(result.current.problem).toBeNull()
  })

  it('refuses a web page or a file over 15 MB with the one shared sentence, and clears it for a good file', () => {
    const { result } = renderHook(() => useUploadCheck('document'))
    const sentence = 'Choose a PDF, JPEG, PNG, WebP or Word (.docx) file of up to 15 MB.'
    act(() => {
      result.current.check({ type: 'text/html', size: 100 })
    })
    expect(result.current.problem).toBe(sentence)
    act(() => {
      result.current.check({ type: 'application/pdf', size: 15 * MB + 1 })
    })
    expect(result.current.problem).toBe(sentence)
    act(() => {
      result.current.check({ type: 'image/png', size: 1000 })
    })
    expect(result.current.problem).toBeNull()
  })

  it('holds a KYC file to 10 MB', () => {
    const { result } = renderHook(() => useUploadCheck('kyc'))
    act(() => {
      result.current.check({ type: 'application/pdf', size: 11 * MB })
    })
    expect(result.current.problem).toBe('Choose a PDF, JPEG, PNG or WebP file of up to 10 MB.')
  })
})
