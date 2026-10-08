import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import type { ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'

// Review F-116: the directory's search matches a name, or — when the text has an @ — the START of
// the email address. The box says so in one line, so nobody types the middle of an address and
// reads the empty answer as "no such student".
vi.mock('@/features/auth/AdminShell', () => ({ AdminShell: ({ children }: { children: ReactNode }) => <div>{children}</div> }))
vi.mock('./PersonSignInDrawer', () => ({ PersonSignInDrawer: () => null }))
vi.mock('@/queries/adminUserDirectories', () => ({
  useSentpoUserDirectory: () => ({ data: { items: [], meta: { next_cursor: null, total: 0 } }, isLoading: false, isError: false }),
  fetchAllSentpoUserDirectory: vi.fn(),
  isErasedRow: () => false,
}))

import { SentpoUsersPage } from './SentpoUsersPage'

describe('Sentpo Users search', () => {
  it('says what to type, under the search box', () => {
    render(
      <MemoryRouter>
        <SentpoUsersPage />
      </MemoryRouter>,
    )
    const box = screen.getByPlaceholderText('Search by name or email…')
    const hint = screen.getByText('Type a name, or the start of an email address.')
    expect(box.parentElement).toContainElement(hint)
  })
})
