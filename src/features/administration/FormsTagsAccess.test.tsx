import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// Review F-146 / F-055, the leftovers. The server now checks these writes, so the console offers
// each control only to someone the server will let through:
//   - creating, editing and duplicating a form: the `settings.manage_templates` permission
//     (reading the list stays open to every employee);
//   - deleting a tag: the consultancy's admin alone (adding one stays open to all staff).
// (Removing a phonebook contact is the admin's alone too; that is pinned in PhonebookCopy.test.tsx.)
vi.mock('@/features/auth/AppShell', () => ({ AppShell: ({ children }: { children: ReactNode }) => <div>{children}</div> }))
const access = vi.hoisted(() => ({ isAdmin: false, keys: [] as string[] }))
vi.mock('@/lib/permissions', () => ({
  usePermissionChecker: () => ({
    can: (key: string) => access.keys.includes(key),
    isAdmin: access.isAdmin,
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  }),
}))
vi.mock('@/queries/formTemplates', () => ({
  useFormTemplates: () => ({
    isLoading: false,
    isError: false,
    data: [{ id: 'f1', name: 'Student intake', version: 3, fields: [{ id: 'a' }, { id: 'b' }] }],
  }),
  useDuplicateFormTemplate: () => ({ mutate: vi.fn(), isPending: false, isError: false }),
}))
vi.mock('@/queries/tags', () => ({
  useTags: () => ({ isLoading: false, data: [{ id: 't1', name: 'Scholarship' }] }),
  useCreateTag: () => ({ mutate: vi.fn(), isPending: false, isError: false }),
  useDeleteTag: () => ({ mutate: vi.fn(), isPending: false, isError: false }),
}))
vi.mock('@/lib/listCeilings', () => ({ useListCeiling: () => null }))

import { FormsPage } from './FormsPage'
import { TagManagementTab } from './ConsultancyTagManagementTab'

function renderIn(ui: ReactNode) {
  render(<MemoryRouter>{ui}</MemoryRouter>)
}

beforeEach(() => {
  access.isAdmin = false
  access.keys = []
})

describe('Forms (settings.manage_templates)', () => {
  it('shows the list to everyone, without the controls the server would refuse', () => {
    renderIn(<FormsPage />)
    expect(screen.getByText('Student intake')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Create New' })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Edit Student intake' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Duplicate Student intake' })).not.toBeInTheDocument()
  })

  it('offers create, edit and duplicate to someone who holds the permission', () => {
    access.keys = ['settings.manage_templates']
    renderIn(<FormsPage />)
    expect(screen.getByRole('button', { name: 'Create New' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Edit Student intake' })).toHaveAttribute('href', '/administration/forms/f1')
    expect(screen.getByRole('button', { name: 'Duplicate Student intake' })).toBeInTheDocument()
  })

  it('does not treat another settings permission as this one', () => {
    access.keys = ['settings.edit_profile']
    renderIn(<FormsPage />)
    expect(screen.queryByRole('button', { name: 'Create New' })).not.toBeInTheDocument()
  })
})

describe('Tags', () => {
  it('lets any member of staff add a tag, and shows no delete control', () => {
    access.keys = ['settings.edit_profile']
    renderIn(<TagManagementTab />)
    expect(screen.getByText('Scholarship')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Add tag/ })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Delete Scholarship' })).not.toBeInTheDocument()
  })

  it('shows the delete control to the consultancy admin', () => {
    access.isAdmin = true
    renderIn(<TagManagementTab />)
    expect(screen.getByRole('button', { name: 'Delete Scholarship' })).toBeInTheDocument()
  })
})
