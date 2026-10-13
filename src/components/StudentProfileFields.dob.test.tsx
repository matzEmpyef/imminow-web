import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

// Phase 8, D-129 C-2: a student a consultancy set up has no date of birth until they give it at
// their first sign-in. The profile says so, in the same words wherever it is shown, and works out
// no age from it.
const ladder = vi.hoisted(() => ({
  all: [],
  options: [],
  label: (code: string | null | undefined) => code ?? '',
  rank: () => null,
}))
vi.mock('@/lib/studyLevels', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/studyLevels')>()),
  useLevelLadder: () => ladder,
}))

import { StudentProfileFields, StudentProfilePanels } from './StudentProfileFields'

type Prefs = React.ComponentProps<typeof StudentProfileFields>['prefs']

function row(label: string) {
  return screen.getByText(label, { selector: 'dt' }).closest('div')!
}

describe('a student’s date of birth on the profile', () => {
  it('reads "Not provided yet" in the plain list when there is none', () => {
    render(<StudentProfileFields prefs={{ date_of_birth: null } as Prefs} />)
    expect(row('Date of birth')).toHaveTextContent('Not provided yet')
    expect(screen.queryByText(/\bage\b/i)).not.toBeInTheDocument()
  })

  it('does not count a missing date of birth as a detail added', () => {
    const added = (dob: string | null) => {
      const { unmount } = render(<StudentProfilePanels prefs={{ date_of_birth: dob } as Prefs} />)
      const found = /(\d+) of \d+ details added/.exec(document.body.textContent ?? '')
      unmount()
      return Number(found?.[1])
    }
    expect(added('2004-03-05')).toBe(added(null) + 1)
  })

  it('reads "Not provided yet" in the panels too', () => {
    render(<StudentProfilePanels prefs={{ date_of_birth: null } as Prefs} />)
    expect(row('Date of birth')).toHaveTextContent('Not provided yet')
  })

  it('shows the date as DD-MM-YYYY once the student has given it', () => {
    render(<StudentProfileFields prefs={{ date_of_birth: '2004-03-05' } as Prefs} />)
    expect(row('Date of birth')).toHaveTextContent('05-03-2004')
    expect(screen.queryByText('Not provided yet')).not.toBeInTheDocument()
  })
})
