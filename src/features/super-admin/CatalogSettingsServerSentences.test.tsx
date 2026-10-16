import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// Decision 154, ruling 14: a refused save says what the server said, not "Not saved".
const state = vi.hoisted(() => ({
  failure: null as Error | null,
}))

function failing() {
  return { mutate: vi.fn(), isPending: false, isError: state.failure !== null, error: state.failure }
}

vi.mock('@/queries/countries', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/queries/countries')>()),
  useUpdateState: () => failing(),
  useSetCountryActive: () => failing(),
  useUpdateCountryWindow: () => failing(),
}))
vi.mock('@/lib/toast', () => ({ showToast: vi.fn() }))

import { CountryActiveToggle, CountryWindowField, StateActiveToggle } from './CatalogSettingsPage'

beforeEach(() => {
  state.failure = new Error('Kerala cannot be switched off while a branch uses it.')
})

describe('Catalog Settings, a refused save', () => {
  it("shows the server's sentence beside a state's switch", () => {
    render(<StateActiveToggle country="India" state={{ name: 'Kerala', active: true } as never} canEdit />)
    expect(screen.getByRole('alert')).toHaveTextContent('Kerala cannot be switched off while a branch uses it.')
    expect(screen.queryByText('Not saved')).not.toBeInTheDocument()
  })

  it("shows the server's sentence beside a country's switch", () => {
    render(<CountryActiveToggle row={{ name: 'Canada', active: true } as never} />)
    expect(screen.getByRole('alert')).toHaveTextContent('Kerala cannot be switched off while a branch uses it.')
  })

  it("shows the server's sentence beside a country's days field", () => {
    render(
      <CountryWindowField
        row={{ name: 'Canada' } as never}
        field="offer_turnaround_days"
        label="Offer turnaround"
        hint="Days"
        value={30}
      />,
    )
    expect(screen.getByRole('alert')).toHaveTextContent('Kerala cannot be switched off while a branch uses it.')
  })

  it('falls back to "Not saved" only when the error carries no words', () => {
    state.failure = new Error('')
    render(<CountryActiveToggle row={{ name: 'Canada', active: true } as never} />)
    expect(screen.getByRole('alert')).toHaveTextContent('Not saved')
  })
})
