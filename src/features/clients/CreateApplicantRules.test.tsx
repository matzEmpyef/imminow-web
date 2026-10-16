import { configure, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// Decision 154 on Create Applicant: the name rule, the one email and phone rules (a phone typed
// without a country code is read in the consultancy's country, here India), nothing untrimmed is
// sent, and a sentence the server names for a field sits beside that field.
vi.mock('react-router-dom', async (importOriginal) => ({
  ...(await importOriginal<typeof import('react-router-dom')>()),
  useNavigate: () => vi.fn(),
}))
vi.mock('@/api/client', () => ({ api: { GET: vi.fn(), POST: vi.fn() } }))
vi.mock('@/lib/toast', () => ({ showToast: vi.fn() }))
vi.mock('@/components/ServerSearchSelect', () => ({
  ServerSearchSelect: ({ label, value, onChange }: { label: string; value: string; onChange: (id: string) => void }) => (
    <input aria-label={label} value={value} onChange={(e) => onChange(e.target.value)} />
  ),
}))
vi.mock('@/lib/accountWords', () => ({ useAccountWords: () => ({ isInstitute: false, person: 'consultant' }) }))

import { api } from '@/api/client'
import { CreateApplicantModal } from './CreateApplicantModal'

const mockedPost = vi.mocked(api.POST)
configure({ asyncUtilTimeout: 5000 })

function renderModal() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  render(
    <QueryClientProvider client={client}>
      <CreateApplicantModal onClose={vi.fn()} />
    </QueryClientProvider>,
  )
}

function fill(overrides: Record<string, string> = {}) {
  const values: Record<string, string> = {
    'First name': 'Asha',
    'Last name': 'Rao',
    Email: 'asha@example.com',
    ...overrides,
  }
  for (const [label, value] of Object.entries(values)) {
    fireEvent.change(screen.getByLabelText(label), { target: { value } })
  }
  fireEvent.click(screen.getByLabelText('Student'))
  fireEvent.change(screen.getByLabelText('Assigned Consultant'), { target: { value: 'e1' } })
  fireEvent.click(screen.getByLabelText(/16 or older/))
}

const create = () => screen.getByRole('button', { name: 'Create Applicant' })

beforeEach(() => {
  mockedPost.mockReset()
})

describe('Create Applicant: the rules', () => {
  it('sends names, email and address trimmed, the email lower-cased and a local phone with +91', async () => {
    mockedPost.mockResolvedValue({
      data: { kind: 'created', client: { id: 'c1' } },
      error: undefined,
      response: { status: 201 },
    } as never)
    renderModal()
    fill({
      'First name': '  Asha ',
      'Last name': ' Rao  Nair ',
      Email: ' Asha@Example.COM ',
      Phone: '98765 43210',
      Address: '  12 MG Road ',
    })
    fireEvent.click(create())
    await waitFor(() => expect(mockedPost).toHaveBeenCalled())
    expect((mockedPost.mock.calls[0][1] as { body: unknown }).body).toMatchObject({
      first_name: 'Asha',
      last_name: 'Rao Nair',
      email: 'asha@example.com',
      phone: '+919876543210',
      address: '12 MG Road',
    })
  })

  it('takes names in an Indian script', () => {
    renderModal()
    fill({ 'First name': 'आशा', 'Last name': 'राव' })
    expect(create()).toBeEnabled()
  })

  it('keeps Create off for a name with a digit, and says why once the field is left', () => {
    renderModal()
    fill({ 'First name': 'Asha2' })
    expect(create()).toBeDisabled()
    fireEvent.blur(screen.getByLabelText('First name'))
    expect(screen.getByText(/Use letters, spaces, hyphens, apostrophes and full stops only/)).toBeInTheDocument()
  })

  it('stops a name at 100 characters and shows the counter near the end', () => {
    renderModal()
    const first = screen.getByLabelText('First name') as HTMLInputElement
    fireEvent.change(first, { target: { value: 'a'.repeat(120) } })
    expect(first.value).toHaveLength(100)
    expect(screen.getByText('100 / 100')).toBeInTheDocument()
  })

  it('holds a +91 number to ten digits starting 6 to 9', () => {
    renderModal()
    fill({ Phone: '5876543210' })
    expect(create()).toBeDisabled()
    expect(screen.getByText('An Indian (+91) number has 10 digits and starts with 6, 7, 8 or 9.')).toBeInTheDocument()
  })

  it('puts a sentence the server names beside its field, once, until the field is changed', async () => {
    mockedPost.mockResolvedValue({
      data: undefined,
      error: {
        error: {
          code: 'validation_failed',
          message: 'Some details need a second look.',
          details: { fields: { email: 'That email address cannot receive mail.' } },
        },
      },
      response: { status: 400 },
    } as never)
    renderModal()
    fill()
    fireEvent.click(create())
    expect(await screen.findByText('That email address cannot receive mail.')).toBeInTheDocument()
    expect(screen.queryByText('Some details need a second look.')).not.toBeInTheDocument()
    expect(screen.getByLabelText('Email')).toHaveAttribute('aria-invalid', 'true')
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'asha.rao@example.com' } })
    expect(screen.queryByText('That email address cannot receive mail.')).not.toBeInTheDocument()
  })
})
