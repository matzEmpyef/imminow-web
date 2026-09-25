import { beforeEach, describe, expect, it, vi } from 'vitest'

// Contract gate 7 (Wave 3 plan §7): every console upload flow shares this one three-step
// presigned upload instead of its own multipart POST. These pin the sequence and the two ways it
// can fail before the caller ever gets to name a `file_upload_id`.
vi.mock('@/api/client', () => ({ api: { POST: vi.fn() } }))

import { api } from '@/api/client'
import { ApiError } from '@/api/errors'
import { presignedUpload } from './uploads'

const mockedPost = vi.mocked(api.POST)

function file(name = 'passport.pdf', type = 'application/pdf', bytes = 'x') {
  return new File([bytes], name, { type })
}

beforeEach(() => {
  mockedPost.mockReset()
  vi.stubGlobal('fetch', vi.fn())
})

describe('presignedUpload', () => {
  it('starts the intent, PUTs the bytes to put_url with put_headers, then completes it', async () => {
    mockedPost
      .mockResolvedValueOnce({
        data: {
          id: 'upload-1',
          status: 'pending',
          put_url: 'https://storage.example/upload-1?token=abc',
          put_headers: { 'Content-Type': 'application/pdf' },
        },
        error: undefined,
      } as never)
      .mockResolvedValueOnce({ data: { id: 'upload-1', status: 'clean' }, error: undefined } as never)
    vi.mocked(fetch).mockResolvedValue({ ok: true } as Response)

    const result = await presignedUpload({ file: file(), purpose: 'case_upload', journeyId: 'journey-1' })

    expect(result).toEqual({ id: 'upload-1', status: 'clean' })
    // Step 1: the intent names the purpose and the case it belongs to.
    expect(mockedPost).toHaveBeenNthCalledWith(
      1,
      '/file-uploads',
      expect.objectContaining({
        body: expect.objectContaining({ purpose: 'case_upload', journey_id: 'journey-1', filename: 'passport.pdf' }),
      }),
    )
    // Step 2: the bytes go straight to put_url, with put_headers, never back through the API.
    expect(fetch).toHaveBeenCalledWith(
      'https://storage.example/upload-1?token=abc',
      expect.objectContaining({ method: 'PUT', headers: { 'Content-Type': 'application/pdf' } }),
    )
    // Step 3: complete is called with the intent's own id.
    expect(mockedPost).toHaveBeenNthCalledWith(
      2,
      '/file-uploads/{id}/complete',
      expect.objectContaining({ params: { path: { id: 'upload-1' } } }),
    )
  })

  it('throws before the caller can attach a file the scan quarantined', async () => {
    mockedPost
      .mockResolvedValueOnce({
        data: { id: 'upload-2', status: 'pending', put_url: 'https://storage.example/upload-2', put_headers: {} },
        error: undefined,
      } as never)
      .mockResolvedValueOnce({ data: { id: 'upload-2', status: 'quarantined' }, error: undefined } as never)
    vi.mocked(fetch).mockResolvedValue({ ok: true } as Response)

    const result = presignedUpload({ file: file(), purpose: 'library' })
    await expect(result).rejects.toThrow(ApiError)
    await expect(result).rejects.toMatchObject({ code: 'file_quarantined' })
  })

  it('throws when the intent itself is refused (e.g. an unsupported type)', async () => {
    mockedPost.mockResolvedValueOnce({
      data: undefined,
      error: { error: { code: 'unsupported_file_type', message: 'Case files must be PDF, JPEG, PNG, WebP or DOCX.' } },
    } as never)

    await expect(presignedUpload({ file: file(), purpose: 'case_upload', journeyId: 'j1' })).rejects.toMatchObject({
      message: 'Case files must be PDF, JPEG, PNG, WebP or DOCX.',
    })
    // Never reaches the PUT once the intent itself is refused.
    expect(fetch).not.toHaveBeenCalled()
  })

  it('throws when the PUT to object storage fails', async () => {
    mockedPost.mockResolvedValueOnce({
      data: { id: 'upload-3', status: 'pending', put_url: 'https://storage.example/upload-3', put_headers: {} },
      error: undefined,
    } as never)
    vi.mocked(fetch).mockResolvedValue({ ok: false } as Response)

    await expect(presignedUpload({ file: file(), purpose: 'case_upload', journeyId: 'j1' })).rejects.toThrow()
    // Complete is never called for bytes that never arrived.
    expect(mockedPost).toHaveBeenCalledTimes(1)
  })
})
