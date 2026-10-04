import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// Gate 12c (F64): raising the minimum version needs a reason, the body is partial, and a 409
// `lockout_guard` becomes a confirm dialog that re-sends with `force: true`.
vi.mock('@/queries/appConfig', () => ({ useAppConfig: vi.fn(), useUpdateAppConfig: vi.fn() }))
vi.mock('@/features/auth/AdminShell', () => ({ AdminShell: ({ children }: { children: unknown }) => children }))
vi.mock('./FeaturedAccountsCard', () => ({
  FeaturedConsultanciesCard: () => null,
  FeaturedInstitutesCard: () => null,
  FeaturedJobsCard: () => null,
}))
vi.mock('@/lib/toast', () => ({ showToast: vi.fn() }))

import { useAppConfig, useUpdateAppConfig } from '@/queries/appConfig'
import { ApiError } from '@/api/errors'
import { VersionAndRatingCard } from './AppConfigPage'

const config = {
  latest_version: '1.4.0',
  minimum_version: '1.0.0',
  update_url: 'https://play.google.com/store/apps/details?id=com.sentpo.app',
  update_url_android: null,
  update_url_ios: null,
  release_notes: 'Faster search.',
  rating: { min_days_since_install: 3, min_sessions: 5, cooldown_days: 30 },
}

const mutate = vi.fn()

beforeEach(() => {
  mutate.mockReset()
  vi.mocked(useAppConfig).mockReturnValue({ data: config, isLoading: false, isError: false } as never)
  vi.mocked(useUpdateAppConfig).mockReturnValue({ mutate, isPending: false, isError: false, error: null } as never)
})

function setMinimum(value: string) {
  fireEvent.change(screen.getByLabelText(/^Minimum version/), { target: { value } })
}

describe('App Config — version gate (gate 12c)', () => {
  it('sends a partial body with no reason when the minimum is untouched', () => {
    render(<VersionAndRatingCard />)
    fireEvent.change(screen.getByLabelText(/^Release notes/), { target: { value: 'Even faster.' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(mutate.mock.calls[0][0]).toEqual({ release_notes: 'Even faster.' })
  })

  it('asks for a reason when the minimum rises and blocks Save until it is given', () => {
    render(<VersionAndRatingCard />)
    expect(screen.queryByLabelText(/^Reason for raising/)).not.toBeInTheDocument()
    setMinimum('1.2.0')
    expect(screen.getByLabelText(/^Reason for raising/)).toBeInTheDocument()
    expect(screen.getByText(/kept on the audit record/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled()

    fireEvent.change(screen.getByLabelText(/^Reason for raising/), { target: { value: 'Security fix' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    // the version-change confirmation comes first, then the PATCH
    fireEvent.click(screen.getByRole('button', { name: 'Change gate' }))
    expect(mutate.mock.calls[0][0]).toEqual({ minimum_version: '1.2.0', reason: 'Security fix' })
  })

  it('does not ask for a reason when the minimum is lowered', () => {
    vi.mocked(useAppConfig).mockReturnValue({
      data: { ...config, minimum_version: '1.2.0' },
      isLoading: false,
      isError: false,
    } as never)
    render(<VersionAndRatingCard />)
    setMinimum('1.1.0')
    expect(screen.queryByLabelText(/^Reason for raising/)).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Save' })).toBeEnabled()
  })

  it('turns a 409 lockout_guard into a confirm dialog that re-sends with force and the reason', () => {
    render(<VersionAndRatingCard />)
    setMinimum('1.4.0')
    fireEvent.change(screen.getByLabelText(/^Reason for raising/), { target: { value: 'Old builds are insecure' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    fireEvent.click(screen.getByRole('button', { name: 'Change gate' }))

    // The server refuses: the new minimum is above what any active student runs.
    const refusal = new ApiError('fallback', {
      error: {
        code: 'lockout_guard',
        message: 'would block every installed app',
        details: { affected_students: 1280, newest_reported_version: '1.3.2' },
      },
    })
    const options = mutate.mock.calls[0][1] as { onError: (e: unknown) => void }
    act(() => options.onError(refusal))

    const dialog = screen.getByRole('dialog', { name: 'This would lock students out' })
    expect(dialog).toHaveTextContent('lock out 1280 active students')
    expect(dialog).toHaveTextContent('1.3.2')
    expect(dialog).toHaveTextContent('Old builds are insecure')
    fireEvent.click(within(dialog).getByRole('button', { name: 'Lock them out anyway' }))
    expect(mutate.mock.calls[1][0]).toEqual({
      minimum_version: '1.4.0',
      reason: 'Old builds are insecure',
      force: true,
    })
  })

  it('shows how many students the saved minimum blocks, from the 200', () => {
    render(<VersionAndRatingCard />)
    setMinimum('1.2.0')
    fireEvent.change(screen.getByLabelText(/^Reason for raising/), { target: { value: 'Security fix' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    fireEvent.click(screen.getByRole('button', { name: 'Change gate' }))
    const options = mutate.mock.calls[0][1] as { onSuccess: (d: unknown) => void }
    act(() => options.onSuccess({ ...config, minimum_version: '1.2.0', affected_students: 42 }))
    expect(screen.getByRole('status')).toHaveTextContent('42 active students are on a version below 1.2.0')
  })
})
