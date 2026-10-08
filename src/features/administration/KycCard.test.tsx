import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// Review F-066: the certificate goes to private storage in three steps (ask for a link, PUT the
// file to it, name the finished upload), is a PDF or an image, and is shown as what it is.
vi.mock('@/api/client', () => ({ api: { GET: vi.fn(), POST: vi.fn() } }))
vi.mock('@/lib/toast', () => ({ showToast: vi.fn() }))
vi.mock('@/lib/accountWords', () => ({ useAccountWords: () => ({ isInstitute: false }) }))

import { api } from '@/api/client'
import { useAuthStore } from '@/stores/authStore'
import { KycDocument } from '@/components/KycDocument'
import { KycCard } from './KycCard'

const mockedGet = vi.mocked(api.GET)
const mockedPost = vi.mocked(api.POST)

function ok<T>(data: T) {
  return { data, error: undefined, response: { status: 200 } } as never
}

function renderCard() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <KycCard />
    </QueryClientProvider>,
  )
}

function pick(container: HTMLElement, file: File) {
  const input = container.querySelector('input[type="file"]') as HTMLInputElement
  fireEvent.change(input, { target: { files: [file] } })
}

beforeEach(() => {
  mockedGet.mockReset()
  mockedPost.mockReset()
  vi.stubGlobal('fetch', vi.fn())
  useAuthStore.getState().setSession({ access_token: 'a', refresh_token: 'r' })
  mockedGet.mockResolvedValue(ok({ status: 'not_submitted', document_url: null }))
})

describe('the KYC card', () => {
  it('sends a PDF in three steps: the link, the file to the link, then the upload id', async () => {
    mockedPost
      .mockResolvedValueOnce(
        ok({
          upload_id: 'up-1',
          put_url: 'https://storage.example/kyc/up-1?sig=abc',
          content_type: 'application/pdf',
          size_bytes: 4,
          expires_at: '2026-10-08T10:15:00Z',
        }),
      )
      .mockResolvedValueOnce(ok({ status: 'pending' }))
    vi.mocked(fetch).mockResolvedValue({ ok: true } as Response)

    const { container } = renderCard()
    await screen.findByText('KYC Verification')
    const certificate = new File(['%PDF'], 'certificate.pdf', { type: 'application/pdf' })
    pick(container, certificate)
    expect(screen.getByText('certificate.pdf')).toBeInTheDocument()
    // Picking a file sends nothing: the upload starts with the button.
    expect(mockedPost).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: 'Submit for verification' }))

    await waitFor(() => expect(mockedPost).toHaveBeenCalledTimes(2))
    expect(mockedPost).toHaveBeenNthCalledWith(1, '/consultancies/me/kyc/upload', {
      body: { content_type: 'application/pdf', size_bytes: 4 },
    })
    expect(fetch).toHaveBeenCalledWith(
      'https://storage.example/kyc/up-1?sig=abc',
      expect.objectContaining({ method: 'PUT', headers: { 'Content-Type': 'application/pdf' }, body: certificate }),
    )
    expect(mockedPost).toHaveBeenNthCalledWith(2, '/consultancies/me/kyc', { body: { upload_id: 'up-1' } })
  })

  it('does not name an upload the storage refused', async () => {
    mockedPost.mockResolvedValueOnce(
      ok({ upload_id: 'up-2', put_url: 'https://storage.example/kyc/up-2', content_type: 'image/png', size_bytes: 1 }),
    )
    vi.mocked(fetch).mockResolvedValue({ ok: false, status: 403 } as Response)

    const { container } = renderCard()
    await screen.findByText('KYC Verification')
    pick(container, new File(['x'], 'certificate.png', { type: 'image/png' }))
    fireEvent.click(screen.getByRole('button', { name: 'Submit for verification' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Could not upload the file.')
    expect(mockedPost).toHaveBeenCalledTimes(1)
  })

  it('refuses a file type the server does not take, before anything is sent', async () => {
    const { container } = renderCard()
    await screen.findByText('KYC Verification')
    pick(container, new File(['x'], 'certificate.docx', { type: 'application/msword' }))

    expect(screen.getByRole('alert')).toHaveTextContent('Choose a PDF, or a PNG, JPEG or WebP image.')
    expect(screen.getByRole('button', { name: 'Submit for verification' })).toBeDisabled()
    expect(mockedPost).not.toHaveBeenCalled()
  })
})

describe('the KYC card, a rejected certificate', () => {
  it('says why it was not accepted and still offers the upload', async () => {
    mockedGet.mockResolvedValue(
      ok({ status: 'rejected', rejected_at: '2026-10-08T09:00:00Z', rejected_reason: 'The name does not match.', document_url: null }),
    )
    renderCard()
    expect(await screen.findByText('Your certificate was not accepted: The name does not match.')).toBeInTheDocument()
    expect(screen.getByText('rejected')).toBeInTheDocument()
    expect(screen.getByText(/Upload a new certificate below to have it reviewed again\./)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Choose file' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Submit for verification' })).toBeInTheDocument()
  })
})

describe('the submitted certificate', () => {
  it('shows an image in place', () => {
    render(<KycDocument kyc={{ document_url: 'https://s/c.png', document_content_type: 'image/png' }} label="certificate" />)
    expect(screen.getByRole('img', { name: 'Submitted certificate' })).toHaveAttribute('src', 'https://s/c.png')
  })

  it('links to a PDF, saying it is one', () => {
    render(
      <KycDocument kyc={{ document_url: 'https://s/c.pdf', document_content_type: 'application/pdf' }} label="certificate" />,
    )
    expect(screen.getByRole('link', { name: 'View submitted certificate (PDF)' })).toHaveAttribute('href', 'https://s/c.pdf')
    expect(screen.queryByRole('img')).not.toBeInTheDocument()
  })
})
