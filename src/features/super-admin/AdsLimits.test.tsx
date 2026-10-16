import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// Decision 154: an ad's web address is the one https rule, and an ad cannot end before it starts.
// The refusal is said beside the end date on the first step, so nobody reaches the last step with
// a button that will not work.
const create = vi.hoisted(() => ({ mutate: vi.fn(), isPending: false, isError: false, error: null as unknown }))
const idle = vi.hoisted(() => ({ mutate: vi.fn(), isPending: false, isError: false, error: null as unknown }))

vi.mock('@/queries/adsAdmin', () => ({
  useAdClicks: () => ({ data: undefined }),
  useAdminAds: () => ({ data: [] }),
  useCreateAd: () => create,
  useUpdateAd: () => idle,
  useDeleteAd: () => idle,
}))
vi.mock('@/queries/eventsAdmin', () => ({ useAdminEvents: () => ({ data: { items: [] }, isLoading: false }) }))
vi.mock('@/queries/blogArticles', () => ({ useAdminBlogArticles: () => ({ data: { items: [] }, isLoading: false }) }))
vi.mock('@/queries/adminConsultancies', () => ({
  useAdminConsultancies: () => ({ data: undefined }),
  useAdminConsultancy: () => ({ data: undefined }),
}))
vi.mock('@/queries/countries', () => ({ useCountries: () => ({ data: [] }) }))
vi.mock('@/features/super-admin/TargetingFilter', () => ({ TargetingFilter: () => <div>targeting</div> }))
vi.mock('@/components/ImageUploadField', () => ({
  ImageUploadField: ({ onChange }: { onChange: (url: string) => void }) => (
    <button type="button" onClick={() => onChange('https://cdn.example.com/banner.png')}>
      pick image
    </button>
  ),
}))

import { AdFormModal } from './AdsManagerPage'

const URL_SENTENCE = 'Enter a web address that starts with https:// (up to 2048 characters).'
const RANGE_SENTENCE = 'The end date must be on or after the start date.'

beforeEach(() => {
  vi.clearAllMocks()
})

function open() {
  render(<AdFormModal onClose={() => {}} />)
  fireEvent.click(screen.getByRole('button', { name: 'pick image' }))
  fireEvent.change(screen.getByLabelText(/^Destination URL/), { target: { value: 'https://example.com/offer' } })
}

describe('the ad form', () => {
  it('refuses a destination that is not https and says the one sentence', () => {
    open()
    const url = screen.getByLabelText(/^Destination URL/)
    fireEvent.change(url, { target: { value: 'http://example.com/offer' } })
    fireEvent.blur(url)
    expect(screen.getAllByText(URL_SENTENCE).length).toBeGreaterThan(0)
    fireEvent.click(screen.getByRole('button', { name: /Next: Targeting/ }))
    expect(screen.queryByText(/Step 2 of 2/)).not.toBeInTheDocument()
  })

  it('says an end before the start beside the end date and stays on the first step', () => {
    open()
    fireEvent.change(screen.getByLabelText(/^Start date/), { target: { value: '2026-11-10' } })
    fireEvent.change(screen.getByLabelText(/^End date/), { target: { value: '2026-11-01' } })
    expect(screen.getAllByText(RANGE_SENTENCE).length).toBeGreaterThan(0)
    fireEvent.click(screen.getByRole('button', { name: /Next: Targeting/ }))
    expect(screen.queryByText(/Step 2 of 2/)).not.toBeInTheDocument()
    expect(create.mutate).not.toHaveBeenCalled()
  })

  it('creates the ad once the end is on or after the start, with the address trimmed', () => {
    open()
    fireEvent.change(screen.getByLabelText(/^Destination URL/), { target: { value: '  https://example.com/offer  ' } })
    fireEvent.change(screen.getByLabelText(/^Start date/), { target: { value: '2026-11-10' } })
    fireEvent.change(screen.getByLabelText(/^End date/), { target: { value: '2026-11-10' } })
    fireEvent.click(screen.getByRole('button', { name: /Next: Targeting/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Create Ad' }))
    expect(create.mutate).toHaveBeenCalledTimes(1)
    expect(create.mutate.mock.calls[0][0]).toMatchObject({
      destination_url: 'https://example.com/offer',
      active_from: '2026-11-10',
      active_to: '2026-11-10',
    })
  })

  it('bounds both dates to 1900 and 2100', () => {
    open()
    const start = screen.getByLabelText(/^Start date/)
    expect(start).toHaveAttribute('min', '1900-01-01')
    expect(start).toHaveAttribute('max', '2100-12-31')
  })

  it('wants a priority of at least 1', () => {
    open()
    const priority = screen.getByLabelText(/^Priority/)
    fireEvent.change(priority, { target: { value: '0' } })
    fireEvent.blur(priority)
    expect(screen.getByText('Enter a whole number from 1 to 10,00,000.')).toBeInTheDocument()
  })
})
