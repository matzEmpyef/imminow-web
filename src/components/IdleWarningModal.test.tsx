import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// Everything the factory needs lives inside it (Vitest hoists `vi.mock` above the file's other
// top-level statements, so a reference to an outer `const` here would be a TDZ trap) — the mocked
// `useIdleLockStore` is reconfigured per test via `mockImplementation` below instead.
vi.mock('@/lib/idleLock', () => ({
  idleLockManager: { staySignedIn: vi.fn() },
  useIdleLockStore: vi.fn(),
}))

import { idleLockManager, useIdleLockStore } from '@/lib/idleLock'
import { IdleWarningModal } from './IdleWarningModal'

function setIdleState(state: { warning: boolean; secondsRemaining: number }) {
  vi.mocked(useIdleLockStore).mockImplementation(
    (selector: (s: typeof state) => unknown) => selector(state) as never,
  )
}

describe('IdleWarningModal', () => {
  beforeEach(() => {
    vi.mocked(idleLockManager.staySignedIn).mockClear()
  })

  it('renders nothing before the 28-minute warning fires', () => {
    setIdleState({ warning: false, secondsRemaining: 0 })
    render(<IdleWarningModal />)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('shows the live countdown and a "Stay signed in" action once warning', () => {
    setIdleState({ warning: true, secondsRemaining: 125 })
    render(<IdleWarningModal />)

    const dialog = screen.getByRole('dialog', { name: 'Still there?' })
    expect(dialog).toHaveTextContent("You'll be signed out in 2:05 for security.")
    expect(screen.getByRole('button', { name: 'Stay signed in' })).toBeInTheDocument()
  })

  it('"Stay signed in" and the X both call idleLockManager.staySignedIn()', () => {
    setIdleState({ warning: true, secondsRemaining: 90 })
    render(<IdleWarningModal />)

    fireEvent.click(screen.getByRole('button', { name: 'Stay signed in' }))
    expect(idleLockManager.staySignedIn).toHaveBeenCalledTimes(1)

    fireEvent.click(screen.getByRole('button', { name: 'Close' }))
    expect(idleLockManager.staySignedIn).toHaveBeenCalledTimes(2)
  })
})
