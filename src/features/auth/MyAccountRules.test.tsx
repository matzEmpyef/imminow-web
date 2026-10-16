import { fireEvent, render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// Decision 154 on My Account: the name follows the name rule, is sent trimmed, and a refused
// notification change shows the server's sentence (it used to say "That change didn't save").
const state = vi.hoisted(() => ({
  settingsError: null as Error | null,
  updateProfile: vi.fn(),
}))

vi.mock('@/api/client', () => ({ api: { GET: vi.fn(), POST: vi.fn(), PATCH: vi.fn() } }))
vi.mock('@/lib/toast', () => ({ showToast: vi.fn() }))
vi.mock('@/queries/me', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/queries/me')>()),
  useMe: vi.fn(),
}))
vi.mock('@/features/auth/shellForScope', () => {
  const Shell = ({ children }: { children: ReactNode }) => <div>{children}</div>
  return { shellForScope: () => Shell }
})
vi.mock('@/lib/accountWords', () => ({
  useAccountWords: () => ({ isInstitute: false, org: 'consultancy', adminLabel: 'Consultancy Admin' }),
}))
vi.mock('@/queries/consultancy', () => ({ useMyConsultancy: () => ({ data: { name: 'Bright Path' } }) }))
vi.mock('@/queries/notifications', () => ({
  useNotificationSettings: () => ({
    isLoading: false,
    isError: false,
    data: {
      chat: { email: true, push: true },
      plan: { email: true, push: true },
      events: { email: true, push: true },
      broadcast: { email: true, push: true },
    },
  }),
  useUpdateNotificationSettings: () => ({
    mutate: vi.fn(),
    isError: state.settingsError !== null,
    error: state.settingsError,
  }),
}))
vi.mock('./YourDataCard', () => ({ YourDataCard: () => null }))

import { api } from '@/api/client'
import { useMe } from '@/queries/me'
import { useAuthStore } from '@/stores/authStore'
import { meAnswered, staffMe } from '@/test/me'
import { MyAccountPage } from './MyAccountPage'

const mockedGet = vi.mocked(api.GET)
const mockedPatch = vi.mocked(api.PATCH)

const PROFILE = {
  id: 'u1',
  first_name: 'Asha',
  last_name: 'Nair',
  email: 'asha@example.test',
  role: 'consultant',
  phone: null,
  phone_verified: false,
}

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <MyAccountPage />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  state.settingsError = null
  mockedGet.mockReset()
  mockedPatch.mockReset()
  useAuthStore.setState({ accessToken: 'test-token' })
  vi.mocked(useMe).mockReturnValue(meAnswered(staffMe()))
  mockedGet.mockImplementation((async (path: string) =>
    path === '/profile'
      ? { data: { ...PROFILE }, error: undefined, response: { status: 200 } }
      : { data: { items: [] }, error: undefined, response: { status: 200 } }) as never)
  mockedPatch.mockResolvedValue({ data: { ...PROFILE }, error: undefined, response: { status: 200 } } as never)
})

describe('My Account: the name', () => {
  it('is sent trimmed, in any script', async () => {
    renderPage()
    const first = (await screen.findByLabelText(/^First name/)) as HTMLInputElement
    fireEvent.change(first, { target: { value: '  आशा ' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }))
    await vi.waitFor(() => expect(mockedPatch).toHaveBeenCalled())
    expect(mockedPatch.mock.calls[0][1]).toMatchObject({ body: { first_name: 'आशा', last_name: 'Nair' } })
  })

  it('keeps Save off while a name has a digit in it, and says why', async () => {
    renderPage()
    const first = await screen.findByLabelText(/^First name/)
    fireEvent.change(first, { target: { value: 'Asha2' } })
    fireEvent.blur(first)
    expect(screen.getByRole('button', { name: 'Save changes' })).toBeDisabled()
    expect(screen.getByText(/Use letters, spaces, hyphens, apostrophes and full stops only/)).toBeInTheDocument()
  })
})

describe('My Account: a refused notification change', () => {
  it("shows the server's sentence", async () => {
    state.settingsError = new Error('Push notifications cannot be switched off for plan changes.')
    renderPage()
    expect(await screen.findByRole('alert')).toHaveTextContent('Push notifications cannot be switched off for plan changes.')
    expect(screen.queryByText(/That change didn.t save/)).not.toBeInTheDocument()
  })
})
