import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// Owner's ruling 2026-10-09: two clocks on a student's first message to a consultancy, set in
// Settings. Pinned: the saved (or default) values show, a value out of range cannot be saved, a
// change goes out as one PATCH with both numbers, and the server's field sentence is shown beside
// the field it names.
vi.mock('@/api/client', () => ({ api: { GET: vi.fn(), PATCH: vi.fn() } }))
vi.mock('@/lib/toast', () => ({ showToast: vi.fn() }))

import { api } from '@/api/client'
import { showToast } from '@/lib/toast'
import { useAuthStore } from '@/stores/authStore'
import { LeadRepliesTab } from './LeadRepliesTab'

const mockedGet = vi.mocked(api.GET)
const mockedPatch = vi.mocked(api.PATCH)

function renderTab() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  render(
    <QueryClientProvider client={client}>
      <LeadRepliesTab />
    </QueryClientProvider>,
  )
}

const reminder = () => screen.getByLabelText(/Remind the consultancy after/)
const alert = () => screen.getByLabelText(/Tell immiNow after/)
const save = () => screen.getByRole('button', { name: 'Save' })

beforeEach(() => {
  mockedGet.mockReset()
  mockedPatch.mockReset()
  vi.mocked(showToast).mockClear()
  useAuthStore.setState({ accessToken: 'test-token' })
  mockedGet.mockResolvedValue({
    data: { lead_reply_reminder_hours: 3, lead_platform_alert_hours: 30 },
    error: undefined,
  } as never)
  mockedPatch.mockResolvedValue({ data: {}, error: undefined } as never)
})

describe('the Lead Replies settings', () => {
  it('shows the saved hours, and keeps Save off until something changes', async () => {
    renderTab()
    await waitFor(() => expect(reminder()).toHaveValue(3))
    expect(alert()).toHaveValue(30)
    expect(save()).toBeDisabled()
  })

  it('falls back to the defaults, 2 and 24, when the server sends none', async () => {
    mockedGet.mockResolvedValue({ data: {}, error: undefined } as never)
    renderTab()
    await waitFor(() => expect(reminder()).toHaveValue(2))
    expect(alert()).toHaveValue(24)
  })

  it('refuses a value outside 1–48 and 1–168 before sending anything', async () => {
    renderTab()
    await waitFor(() => expect(reminder()).toHaveValue(3))

    fireEvent.change(reminder(), { target: { value: '49' } })
    expect(screen.getByText('A whole number from 1 to 48.')).toBeInTheDocument()
    expect(save()).toBeDisabled()

    fireEvent.change(reminder(), { target: { value: '4' } })
    fireEvent.change(alert(), { target: { value: '169' } })
    expect(screen.getByText('A whole number from 1 to 168.')).toBeInTheDocument()
    expect(save()).toBeDisabled()

    fireEvent.change(alert(), { target: { value: '0' } })
    expect(save()).toBeDisabled()
    fireEvent.change(alert(), { target: { value: '1.5' } })
    expect(save()).toBeDisabled()
    expect(mockedPatch).not.toHaveBeenCalled()
  })

  it('saves both numbers in one PATCH', async () => {
    renderTab()
    await waitFor(() => expect(reminder()).toHaveValue(3))
    fireEvent.change(reminder(), { target: { value: '4' } })
    fireEvent.click(save())

    await waitFor(() =>
      expect(mockedPatch).toHaveBeenCalledWith('/platform/settings', {
        body: { lead_reply_reminder_hours: 4, lead_platform_alert_hours: 30 },
      }),
    )
    await waitFor(() => expect(showToast).toHaveBeenCalledWith('Lead reply settings saved'))
  })

  it('shows the server’s sentence beside the field it names', async () => {
    mockedPatch.mockResolvedValue({
      data: undefined,
      error: {
        error: {
          code: 'validation_failed',
          message: 'Some settings are not valid.',
          details: { fields: { lead_platform_alert_hours: 'The platform alert must come after the reminder.' } },
        },
      },
    } as never)
    renderTab()
    await waitFor(() => expect(reminder()).toHaveValue(3))
    fireEvent.change(alert(), { target: { value: '2' } })
    fireEvent.click(save())

    expect(await screen.findByText('The platform alert must come after the reminder.')).toBeInTheDocument()
    // Changing the value clears the sentence, which was about the old one.
    fireEvent.change(alert(), { target: { value: '5' } })
    expect(screen.queryByText('The platform alert must come after the reminder.')).not.toBeInTheDocument()
  })
})
