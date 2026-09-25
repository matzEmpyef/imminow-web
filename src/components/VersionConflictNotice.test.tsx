import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { VersionConflictNotice } from './VersionConflictNotice'

// The one shared 409 version_conflict notice (contract gate 7, Wave 3 plan §7 item 4) — Plan
// Editor, Plan Templates and Form Builder all render this instead of the generic error line, and
// its only escape is Reload, never a silent overwrite.
describe('VersionConflictNotice', () => {
  it('says someone else changed this, and calls onReload when Reload is clicked', () => {
    const onReload = vi.fn()
    render(<VersionConflictNotice onReload={onReload} />)

    expect(screen.getByRole('alert')).toHaveTextContent('Someone else changed this — reload to see their changes.')
    fireEvent.click(screen.getByRole('button', { name: 'Reload' }))
    expect(onReload).toHaveBeenCalledTimes(1)
  })
})
