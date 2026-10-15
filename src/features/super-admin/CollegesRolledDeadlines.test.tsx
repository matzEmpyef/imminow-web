import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// T4-30: Needs Attention's "Colleges with rolled deadlines" card counts colleges and opens
// /admin/colleges?health=rolled_deadlines. The list asks the server for exactly that filter and
// shows it chosen, instead of dropping it and listing every college.
vi.mock('@/features/auth/AdminShell', () => ({ AdminShell: ({ children }: { children: ReactNode }) => <div>{children}</div> }))
vi.mock('@/queries/adminColleges', () => ({
  useAdminColleges: vi.fn(),
  useImportColleges: () => ({ mutate: vi.fn(), isPending: false }),
}))
vi.mock('@/queries/courseSuggestions', () => ({ useCourses: () => ({ data: undefined, isLoading: true, isError: false }) }))
vi.mock('@/queries/countries', () => ({ useCountries: () => ({ data: [] }) }))
vi.mock('@/lib/studyLevels', () => ({ useLevelLadder: () => [] }))
vi.mock('./CollegeFormModal', () => ({ CollegeFormModal: () => null }))

import { useAdminColleges } from '@/queries/adminColleges'
import { CollegesCoursesPage } from './CollegesCoursesPage'

beforeEach(() => {
  vi.mocked(useAdminColleges).mockReturnValue({
    data: { items: [], meta: { next_cursor: null }, summary: undefined },
    isLoading: false,
    isError: false,
  } as never)
})

function show(address: string) {
  return render(
    <MemoryRouter initialEntries={[address]}>
      <CollegesCoursesPage />
    </MemoryRouter>,
  )
}

describe('Colleges list: the rolled-deadlines link', () => {
  it('asks the server for rolled_deadlines and shows the filter chosen', () => {
    show('/admin/colleges?health=rolled_deadlines')
    expect(vi.mocked(useAdminColleges).mock.calls.at(-1)?.[0]).toMatchObject({ health: 'rolled_deadlines' })
    expect(screen.getByLabelText('Details')).toHaveValue('rolled_deadlines')
  })

  it('lists every college when the link carries no filter', () => {
    show('/admin/colleges')
    expect(vi.mocked(useAdminColleges).mock.calls.at(-1)?.[0]?.health).toBeUndefined()
    expect(screen.getByLabelText('Details')).toHaveValue('')
  })
})
