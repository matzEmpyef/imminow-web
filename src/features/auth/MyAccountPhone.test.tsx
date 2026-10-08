import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// The phone number on My Account (second sign-in review, 2026-10-07). A new number is no longer
// saved by PATCH /profile: the person asks for a code (POST /auth/otp/request), enters it
// (POST /auth/otp/verify), and only then is it saved, verified. Removing is still a plain save.
// Pinned: the whole add / change / verify flow, "Verified" and "Not verified", the note on a legacy
// number, every refusal the two routes give, and that the name form no longer sends a phone.
vi.mock('@/api/client', () => ({ api: { GET: vi.fn(), POST: vi.fn(), PATCH: vi.fn() } }))
vi.mock('@/lib/toast', () => ({ showToast: vi.fn() }))
vi.mock('@/queries/me', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/queries/me')>()),
  useMe: vi.fn(),
}))
// One stable component: a fresh one per render would remount the whole page each time.
vi.mock('@/features/auth/shellForScope', () => {
  const Shell = ({ children }: { children: ReactNode }) => <div>{children}</div>
  return { shellForScope: () => Shell }
})
vi.mock('@/lib/accountWords', () => ({ useAccountWords: () => ({ isInstitute: false, org: 'consultancy', adminLabel: 'Consultancy Admin' }) }))
vi.mock('@/queries/consultancy', () => ({ useMyConsultancy: () => ({ data: { name: 'Bright Path' } }) }))
vi.mock('@/queries/notifications', () => ({
  useNotificationSettings: () => ({ isLoading: false, isError: false, data: undefined }),
  useUpdateNotificationSettings: () => ({ mutate: vi.fn(), isError: false }),
}))
vi.mock('./YourDataCard', () => ({ YourDataCard: () => null }))

import { api } from '@/api/client'
import { showToast } from '@/lib/toast'
import { useMe } from '@/queries/me'
import { useAuthStore } from '@/stores/authStore'
import { meAnswered, platformMe, staffMe } from '@/test/me'
import { MyAccountPage } from './MyAccountPage'

const mockedGet = vi.mocked(api.GET)
const mockedPost = vi.mocked(api.POST)
const mockedPatch = vi.mocked(api.PATCH)

function ok<T>(data: T, status = 200) {
  return { data, error: undefined, response: { status } } as never
}
function refused(status: number, code: string, message: string, details?: Record<string, unknown>) {
  return { data: undefined, error: { error: { code, message, request_id: 'r1', details } }, response: { status } } as never
}

const PROFILE = {
  id: 'u1',
  first_name: 'Asha',
  last_name: 'Nair',
  email: 'asha@example.test',
  role: 'consultant',
  phone: null as string | null,
  phone_verified: false,
}

let profile: typeof PROFILE
// What `GET /auth/otp/step-up` answers. Null = the route says nothing (no first code needed).
let stepUp: Record<string, unknown> | null

const PHONE_CHANNEL = { channel: 'phone', destination_mask: '+91 ••••• ••210' }
const EMAIL_CHANNEL = { channel: 'email', destination_mask: 'as•••@example.test' }

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

const dialog = () => screen.getByRole('dialog', { name: 'Verify your phone number' })

beforeEach(() => {
  mockedGet.mockReset()
  mockedPost.mockReset()
  mockedPatch.mockReset()
  vi.mocked(showToast).mockClear()
  useAuthStore.setState({ accessToken: 'test-token' })
  vi.mocked(useMe).mockReturnValue(meAnswered(staffMe()))
  profile = { ...PROFILE }
  stepUp = null
  mockedGet.mockImplementation((async (path: string) => {
    if (path === '/profile') return ok({ ...profile })
    if (path === '/auth/otp/step-up' && stepUp) return ok(stepUp)
    return ok({ items: [] })
  }) as never)
})

afterEach(() => {
  vi.useRealTimers()
})

describe('the phone number on My Account', () => {
  it('shows a verified number with "Verified", and nothing about removal by its owner', async () => {
    profile = { ...PROFILE, phone: '+919876543210', phone_verified: true }
    renderPage()
    expect(await screen.findByText('+919876543210')).toBeInTheDocument()
    expect(screen.getByText('Verified')).toBeInTheDocument()
    expect(screen.queryByText('Not verified')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Verify' })).not.toBeInTheDocument()
    expect(screen.queryByText(/may be removed from this account/)).not.toBeInTheDocument()
  })

  it('shows a legacy number as "Not verified", with a Verify action and the note', async () => {
    profile = { ...PROFILE, phone: '+919876543210', phone_verified: false }
    renderPage()
    expect(await screen.findByText('Not verified')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Verify' })).toBeInTheDocument()
    expect(
      screen.getByText(
        'An unverified number may be removed from this account if its owner verifies it elsewhere. Verify it to keep it.',
      ),
    ).toBeInTheDocument()
  })

  it('Verify on a legacy number asks for a code to that same number and opens the code step', async () => {
    profile = { ...PROFILE, phone: '+91 98765-43210', phone_verified: false }
    mockedPost.mockResolvedValueOnce(ok({ expires_in_seconds: 600, resend_after_seconds: 30 }, 202))
    renderPage()
    fireEvent.click(await screen.findByRole('button', { name: 'Verify' }))
    await waitFor(() => expect(mockedPost).toHaveBeenCalledWith('/auth/otp/request', { body: { phone: '+919876543210' } }))
    expect(dialog()).toHaveTextContent('+919876543210')
  })

  it('a legacy number without a country code is opened for editing instead, not texted as it is', async () => {
    profile = { ...PROFILE, phone: '98765 43210', phone_verified: false }
    renderPage()
    fireEvent.click(await screen.findByRole('button', { name: 'Verify' }))
    expect(mockedPost).not.toHaveBeenCalled()
    expect(screen.getByLabelText(/^New phone number/)).toHaveValue('98765 43210')
    expect(screen.getByText('Enter the number in international format, e.g. +919876543210.')).toBeInTheDocument()
  })

  it('adds a number: code requested, code entered, number saved as verified', async () => {
    mockedPost.mockResolvedValueOnce(ok({ expires_in_seconds: 600, resend_after_seconds: 30 }, 202))
    renderPage()
    fireEvent.click(await screen.findByRole('button', { name: 'Add phone number' }))
    expect(screen.getByRole('button', { name: 'Send code' })).toBeDisabled()
    fireEvent.change(screen.getByLabelText(/^New phone number/), { target: { value: '+91 98765 43210' } })
    mockedPost.mockClear()
    mockedPost.mockResolvedValueOnce(ok({ expires_in_seconds: 600, resend_after_seconds: 30 }, 202))
    fireEvent.click(screen.getByRole('button', { name: 'Send code' }))
    await waitFor(() => expect(mockedPost).toHaveBeenCalledWith('/auth/otp/request', { body: { phone: '+919876543210' } }))

    const box = await screen.findByLabelText(/^Code/)
    fireEvent.change(box, { target: { value: '123456' } })
    mockedPost.mockResolvedValueOnce(ok(undefined))
    // After saving, the profile reads back with the number verified.
    profile = { ...PROFILE, phone: '+919876543210', phone_verified: true }
    fireEvent.click(within(dialog()).getByRole('button', { name: 'Verify' }))
    await waitFor(() =>
      expect(mockedPost).toHaveBeenCalledWith('/auth/otp/verify', { body: { phone: '+919876543210', code: '123456' } }),
    )
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(showToast).toHaveBeenCalledWith('Phone number verified')
    expect(await screen.findByText('Verified')).toBeInTheDocument()
    // The number never travelled through the profile save.
    expect(mockedPatch).not.toHaveBeenCalled()
  })

  it('refuses a number that is not in international format before asking for a code', async () => {
    renderPage()
    fireEvent.click(await screen.findByRole('button', { name: 'Add phone number' }))
    fireEvent.change(screen.getByLabelText(/^New phone number/), { target: { value: '9876543210' } })
    expect(screen.getByText('Enter the number in international format, e.g. +919876543210.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Send code' })).toBeDisabled()
    expect(mockedPost).not.toHaveBeenCalled()
  })

  it('a wrong code is answered in the one sentence and the dialog stays open', async () => {
    profile = { ...PROFILE, phone: '+919876543210', phone_verified: false }
    mockedPost.mockResolvedValueOnce(ok({ resend_after_seconds: 30 }, 202))
    renderPage()
    fireEvent.click(await screen.findByRole('button', { name: 'Verify' }))
    fireEvent.change(await screen.findByLabelText(/^Code/), { target: { value: '000000' } })
    mockedPost.mockResolvedValueOnce(refused(400, 'invalid_otp', 'Invalid code.', { attempts_remaining: 4 }))
    fireEvent.click(within(dialog()).getByRole('button', { name: 'Verify' }))
    expect(await screen.findByText('That code is incorrect or has expired. Request a new code.')).toBeInTheDocument()
    expect(showToast).not.toHaveBeenCalled()
    expect(dialog()).toBeInTheDocument()
  })

  it('a 429 on the code request shows the server’s sentence and holds Send code for the time given', async () => {
    renderPage()
    fireEvent.click(await screen.findByRole('button', { name: 'Add phone number' }))
    fireEvent.change(screen.getByLabelText(/^New phone number/), { target: { value: '+919876543210' } })
    mockedPost.mockResolvedValueOnce(refused(429, 'rate_limited', 'Too many codes requested. Try again after 14:30.', { retry_after_seconds: 300, retry_at: '2026-10-07T14:30:00+05:30' }))
    fireEvent.click(screen.getByRole('button', { name: 'Send code' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Too many codes requested. Try again after 14:30.')
    expect(screen.getByRole('status')).toHaveTextContent('You can ask again in 5m 00s.')
    expect(screen.getByRole('button', { name: 'Send code' })).toBeDisabled()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('a 429 for the cooldown ("Wait Ns") shows as given and counts down', async () => {
    renderPage()
    fireEvent.click(await screen.findByRole('button', { name: 'Add phone number' }))
    fireEvent.change(screen.getByLabelText(/^New phone number/), { target: { value: '+919876543210' } })
    mockedPost.mockResolvedValueOnce(refused(429, 'rate_limited', 'Wait 20s before requesting another code.', { retry_after_seconds: 20 }))
    fireEvent.click(screen.getByRole('button', { name: 'Send code' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Wait 20s before requesting another code.')
    expect(screen.getByRole('status')).toHaveTextContent('You can ask again in 20s.')
  })

  it('removes a number with a plain profile save after one confirmation', async () => {
    profile = { ...PROFILE, phone: '+919876543210', phone_verified: true }
    mockedPatch.mockResolvedValueOnce(ok({ ...PROFILE }))
    renderPage()
    fireEvent.click(await screen.findByRole('button', { name: 'Remove' }))
    expect(mockedPatch).not.toHaveBeenCalled()
    profile = { ...PROFILE }
    // The server is asked first whether a code is needed; here it is not.
    fireEvent.click(await screen.findByRole('button', { name: 'Remove number' }))
    await waitFor(() => expect(mockedPatch).toHaveBeenCalledWith('/profile', { body: { phone: null } }))
    expect(showToast).toHaveBeenCalledWith('Phone number removed')
  })

  it('changing a number goes through a code too, and the old one stays until the new one is proven', async () => {
    profile = { ...PROFILE, phone: '+919876543210', phone_verified: true }
    renderPage()
    fireEvent.click(await screen.findByRole('button', { name: 'Change' }))
    fireEvent.change(await screen.findByLabelText(/^New phone number/), { target: { value: '+919000000000' } })
    mockedPost.mockResolvedValueOnce(ok({ resend_after_seconds: 30 }, 202))
    fireEvent.click(screen.getByRole('button', { name: 'Send code' }))
    await waitFor(() => expect(mockedPost).toHaveBeenCalledWith('/auth/otp/request', { body: { phone: '+919000000000' } }))
    expect(await screen.findByLabelText(/^Code/)).toBeInTheDocument()
    expect(mockedPatch).not.toHaveBeenCalled()
  })

  it('the name form saves names only: no phone is sent with it', async () => {
    profile = { ...PROFILE, phone: '+919876543210', phone_verified: true }
    mockedPatch.mockResolvedValueOnce(ok({ ...PROFILE, first_name: 'Asha B' }))
    renderPage()
    fireEvent.change(await screen.findByLabelText(/^First name/), { target: { value: 'Asha B' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }))
    await waitFor(() => expect(mockedPatch).toHaveBeenCalledTimes(1))
    expect(mockedPatch).toHaveBeenCalledWith('/profile', { body: { first_name: 'Asha B', last_name: 'Nair' } })
  })

  it('reads the same for platform staff, with their own line about who sees the number', async () => {
    vi.mocked(useMe).mockReturnValue(meAnswered(platformMe({}, { role: 'platform_staff' })))
    profile = { ...PROFILE, role: 'platform_staff', phone: '+919876543210', phone_verified: false }
    renderPage()
    expect(await screen.findByText('Not verified')).toBeInTheDocument()
    expect(screen.getByText('Used by immiNow to reach you. Never shown to students.')).toBeInTheDocument()
    await act(async () => {})
  })
})

// Owner ruling 1 (2026-10-07): a VERIFIED number is changed or removed only after a first code to
// a contact the person already proved. The section says so before anything is sent.
describe('changing or removing a verified number takes a first code', () => {
  const firstDialog = () => screen.getByRole('dialog', { name: 'Step 1 of 2: confirm it is you' })

  beforeEach(() => {
    profile = { ...PROFILE, phone: '+919876543210', phone_verified: true }
    stepUp = { required: true, granted: false, channels: [PHONE_CHANNEL, EMAIL_CHANNEL], valid_for_seconds: 900 }
  })

  it('says two codes are needed, and where the first can go, before anything is sent', async () => {
    renderPage()
    fireEvent.click(await screen.findByRole('button', { name: 'Change' }))

    expect(await screen.findByText('Changing your number takes two codes')).toBeInTheDocument()
    expect(
      screen.getByText(
        'First we send a code to a contact you have already proved, so we know it is you. Then we send a code to the new number.',
      ),
    ).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: 'Your current number (+91 ••••• ••210)' })).toBeChecked()
    expect(screen.getByRole('radio', { name: 'Your email (as•••@example.test)' })).not.toBeChecked()
    expect(mockedPost).not.toHaveBeenCalled()
    expect(screen.queryByLabelText(/^New phone number/)).not.toBeInTheDocument()
  })

  it('runs both codes in order: the first to the chosen contact, then the new number', async () => {
    renderPage()
    fireEvent.click(await screen.findByRole('button', { name: 'Change' }))
    fireEvent.click(await screen.findByRole('radio', { name: 'Your email (as•••@example.test)' }))

    mockedPost.mockResolvedValueOnce(
      ok({ channel: 'email', destination_mask: 'as•••@example.test', expires_in_seconds: 600, resend_after_seconds: 30 }, 202),
    )
    fireEvent.click(screen.getByRole('button', { name: 'Send first code' }))
    await waitFor(() => expect(mockedPost).toHaveBeenCalledWith('/auth/otp/step-up/request', { body: { channel: 'email' } }))
    expect(await screen.findByRole('dialog', { name: 'Step 1 of 2: confirm it is you' })).toHaveTextContent('as•••@example.test')

    fireEvent.change(within(firstDialog()).getByLabelText(/^Code/), { target: { value: '111111' } })
    mockedPost.mockResolvedValueOnce(ok({ ok: true, valid_for_seconds: 900 }))
    fireEvent.click(within(firstDialog()).getByRole('button', { name: 'Continue' }))
    await waitFor(() => expect(mockedPost).toHaveBeenCalledWith('/auth/otp/step-up/verify', { body: { code: '111111' } }))

    // Now, and only now, the new number is asked for.
    expect(await screen.findByText('Step 2 of 2: your new number')).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText(/^New phone number/), { target: { value: '+919000000000' } })
    mockedPost.mockResolvedValueOnce(ok({ resend_after_seconds: 30 }, 202))
    fireEvent.click(screen.getByRole('button', { name: 'Send code' }))
    await waitFor(() => expect(mockedPost).toHaveBeenCalledWith('/auth/otp/request', { body: { phone: '+919000000000' } }))
    expect(dialog()).toHaveTextContent('+919000000000')
  })

  it('names the one contact when there is no choice to make', async () => {
    stepUp = { required: true, granted: false, channels: [PHONE_CHANNEL], valid_for_seconds: 900 }
    renderPage()
    fireEvent.click(await screen.findByRole('button', { name: 'Change' }))
    expect(await screen.findByText('Your current number (+91 ••••• ••210)')).toBeInTheDocument()
    expect(screen.queryByRole('radio')).not.toBeInTheDocument()
  })

  it('goes straight to the new number when a first code was proved a moment ago', async () => {
    stepUp = { required: true, granted: true, channels: [PHONE_CHANNEL], valid_for_seconds: 900 }
    renderPage()
    fireEvent.click(await screen.findByRole('button', { name: 'Change' }))
    expect(await screen.findByLabelText(/^New phone number/)).toBeInTheDocument()
    expect(screen.queryByText('Changing your number takes two codes')).not.toBeInTheDocument()
  })

  it('removing takes the first code too, and the number goes once it is entered', async () => {
    renderPage()
    fireEvent.click(await screen.findByRole('button', { name: 'Remove' }))
    expect(await screen.findByText('Removing your number takes a code')).toBeInTheDocument()
    expect(mockedPatch).not.toHaveBeenCalled()

    mockedPost.mockResolvedValueOnce(ok({ channel: 'sms', destination_mask: '+91 ••••• ••210', resend_after_seconds: 30 }, 202))
    fireEvent.click(screen.getByRole('button', { name: 'Send code' }))
    await waitFor(() => expect(mockedPost).toHaveBeenCalledWith('/auth/otp/step-up/request', { body: { channel: 'phone' } }))

    const box = await screen.findByRole('dialog', { name: 'Confirm it is you' })
    fireEvent.change(within(box).getByLabelText(/^Code/), { target: { value: '222222' } })
    mockedPost.mockResolvedValueOnce(ok({ ok: true, valid_for_seconds: 900 }))
    mockedPatch.mockResolvedValueOnce(ok({ ...PROFILE }))
    fireEvent.click(within(box).getByRole('button', { name: 'Remove number' }))

    await waitFor(() => expect(mockedPatch).toHaveBeenCalledWith('/profile', { body: { phone: null } }))
    expect(showToast).toHaveBeenCalledWith('Phone number removed')
  })

  it('a change refused for want of a first code opens the first step, with the contacts it names', async () => {
    // The check said a first code was already proved; by the time the new number is sent it has run out.
    stepUp = { required: true, granted: true, channels: [PHONE_CHANNEL], valid_for_seconds: 900 }
    renderPage()
    fireEvent.click(await screen.findByRole('button', { name: 'Change' }))
    fireEvent.change(await screen.findByLabelText(/^New phone number/), { target: { value: '+919000000000' } })
    mockedPost.mockResolvedValueOnce(
      refused(400, 'step_up_required', 'Confirm it is you first.', { channels: [PHONE_CHANNEL, EMAIL_CHANNEL] }),
    )
    fireEvent.click(screen.getByRole('button', { name: 'Send code' }))

    expect(await screen.findByText('Changing your number takes two codes')).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: 'Your email (as•••@example.test)' })).toBeInTheDocument()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('adding a first number, or verifying the one already here, asks for no first code', async () => {
    profile = { ...PROFILE, phone: '+919876543210', phone_verified: false }
    renderPage()
    fireEvent.click(await screen.findByRole('button', { name: 'Change' }))
    expect(screen.getByLabelText(/^New phone number/)).toBeInTheDocument()
    expect(mockedGet).not.toHaveBeenCalledWith('/auth/otp/step-up')
  })
})

