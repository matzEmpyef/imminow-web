import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// Review 2.64. The server lets every employee READ a form and keeps writes behind
// `settings.manage_templates`. Staff without it open a form from the list and see it read-only:
// the fields and their settings, nothing to change, no Save.
vi.mock('@/features/auth/AppShell', () => ({ AppShell: ({ children }: { children: ReactNode }) => <div>{children}</div> }))
vi.mock('@/lib/accountWords', () => ({ useAccountWords: () => ({ org: 'consultancy' }) }))
const access = vi.hoisted(() => ({ keys: [] as string[], isLoading: false, isError: false }))
vi.mock('@/lib/permissions', () => ({
  usePermissionChecker: () => ({
    can: (key: string) => access.keys.includes(key),
    isAdmin: false,
    isLoading: access.isLoading,
    isError: access.isError,
    refetch: vi.fn(),
  }),
}))
vi.mock('@/lib/listCeilings', () => ({ useListCeiling: () => null }))
vi.mock('@/lib/toast', () => ({ showToast: vi.fn() }))
vi.mock('@/queries/formTemplates', () => ({
  useFormTemplates: vi.fn(),
  useFormTemplate: vi.fn(),
  useCreateFormTemplate: vi.fn(),
  useUpdateFormTemplate: vi.fn(),
  useDuplicateFormTemplate: vi.fn(),
  useRestoreDefaultFormTemplate: vi.fn(),
}))

import {
  useCreateFormTemplate,
  useDuplicateFormTemplate,
  useFormTemplate,
  useFormTemplates,
  useRestoreDefaultFormTemplate,
  useUpdateFormTemplate,
} from '@/queries/formTemplates'
import { FormsPage } from './FormsPage'
import { FormBuilderPage } from './FormBuilderPage'

const FORM = {
  id: 'f1',
  name: 'Student intake',
  version: 3,
  is_default: true,
  fields: [
    { id: 'a', type: 'text', label: 'First name', required: true, width: 'half' },
    {
      id: 'g',
      type: 'group',
      label: 'Background',
      required: false,
      fields: [
        { id: 'b', type: 'single_select', label: 'Level', required: false, width: 'full', options: ['Bachelor', 'Master'] },
        {
          id: 'c',
          type: 'table',
          label: 'Education',
          required: false,
          width: 'full',
          table_columns: [
            { id: 'c1', type: 'text', label: 'Institution', required: true },
            { id: 'c2', type: 'date', label: 'Finished on', required: false },
          ],
        },
      ],
    },
  ],
}

function Where() {
  return <p data-testid="where">{useLocation().pathname}</p>
}

function renderAt(path: string) {
  render(
    <MemoryRouter initialEntries={[path]}>
      <Where />
      <Routes>
        <Route path="/administration/forms" element={<FormsPage />} />
        <Route path="/administration/forms/:id" element={<FormBuilderPage />} />
      </Routes>
    </MemoryRouter>,
  )
}

beforeEach(() => {
  access.keys = []
  access.isLoading = false
  access.isError = false
  vi.mocked(useFormTemplates).mockReturnValue({ isLoading: false, isError: false, data: [FORM] } as never)
  vi.mocked(useFormTemplate).mockReturnValue({ data: FORM, isLoading: false, isError: false, refetch: vi.fn() } as never)
  const idle = { mutate: vi.fn(), isPending: false, isError: false, error: null, reset: vi.fn() }
  vi.mocked(useCreateFormTemplate).mockReturnValue(idle as never)
  vi.mocked(useUpdateFormTemplate).mockReturnValue(idle as never)
  vi.mocked(useDuplicateFormTemplate).mockReturnValue(idle as never)
  vi.mocked(useRestoreDefaultFormTemplate).mockReturnValue(idle as never)
})

describe('Forms without the template permission', () => {
  it('offers a way to open each form from the list, by View and by clicking the row', () => {
    renderAt('/administration/forms')
    expect(screen.queryByRole('link', { name: 'Edit Student intake' })).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'View Student intake' })).toHaveAttribute('href', '/administration/forms/f1')
    fireEvent.click(screen.getByText('Student intake'))
    expect(screen.getByTestId('where')).toHaveTextContent('/administration/forms/f1')
  })

  it('opens the form read-only: fields and settings are shown, nothing can be changed or saved', () => {
    renderAt('/administration/forms/f1')
    expect(screen.getByRole('heading', { name: 'Student intake' })).toBeInTheDocument()
    expect(screen.getByText(/You can look at this form but not change it/)).toBeInTheDocument()
    // Fields, in groups too, with what each is set to.
    expect(screen.getByText('First name')).toBeInTheDocument()
    expect(screen.getByText('Text · Required · Half width')).toBeInTheDocument()
    expect(screen.getByText('Background')).toBeInTheDocument()
    expect(screen.getByText('Options: Bachelor, Master')).toBeInTheDocument()
    expect(screen.getByText('Columns: Institution (text, required), Finished on (date)')).toBeInTheDocument()
    // Nothing editable.
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
    for (const name of [/^Save/, /^Create Form/, 'Add Field', 'Add Group', 'Restore default', /^Edit /, /^Remove /, /^Drag /]) {
      expect(screen.queryByRole('button', { name })).not.toBeInTheDocument()
    }
    expect(screen.getByRole('link', { name: /Back to Forms/ })).toHaveAttribute('href', '/administration/forms')
  })

  it('says so when the form cannot be read', () => {
    vi.mocked(useFormTemplate).mockReturnValue({ data: undefined, isLoading: false, isError: true, refetch: vi.fn() } as never)
    renderAt('/administration/forms/f1')
    expect(screen.getByText('Could not load this form.')).toBeInTheDocument()
  })

  it('holds back, rather than show the read-only view, while the permission is still unknown', () => {
    access.isLoading = true
    renderAt('/administration/forms/f1')
    expect(screen.queryByRole('heading', { name: 'Student intake' })).not.toBeInTheDocument()
  })

  it('does not call a failed permission check a denial', () => {
    access.isError = true
    renderAt('/administration/forms/f1')
    expect(screen.getByText('Could not check your permissions.')).toBeInTheDocument()
    expect(screen.queryByText(/You can look at this form/)).not.toBeInTheDocument()
  })

  it('still opens the editor for someone who holds the permission', () => {
    access.keys = ['settings.manage_templates']
    renderAt('/administration/forms/f1')
    expect(screen.getByRole('heading', { name: 'Edit Form' })).toBeInTheDocument()
    expect(screen.queryByText(/You can look at this form/)).not.toBeInTheDocument()
  })
})

describe('Forms driven by can_edit from the server', () => {
  it('opens read-only when can_edit is false, even for someone who holds the permission', () => {
    access.keys = ['settings.manage_templates']
    vi.mocked(useFormTemplate).mockReturnValue({
      data: { ...FORM, can_edit: false },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    } as never)
    renderAt('/administration/forms/f1')
    expect(screen.getByText(/You can look at this form but not change it/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^Save/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Add Field' })).not.toBeInTheDocument()
  })

  it('opens the editor when can_edit is true, without waiting on the permission check', () => {
    access.isLoading = true
    vi.mocked(useFormTemplate).mockReturnValue({
      data: { ...FORM, can_edit: true },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    } as never)
    renderAt('/administration/forms/f1')
    expect(screen.getByRole('heading', { name: 'Edit Form' })).toBeInTheDocument()
  })

  it('shows View, not Edit, on a listed form with can_edit false, and opens it on a row click', () => {
    access.keys = ['settings.manage_templates']
    vi.mocked(useFormTemplates).mockReturnValue({
      isLoading: false,
      isError: false,
      data: [{ ...FORM, can_edit: false }],
    } as never)
    renderAt('/administration/forms')
    expect(screen.queryByRole('link', { name: 'Edit Student intake' })).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'View Student intake' })).toBeInTheDocument()
    fireEvent.click(screen.getByText('Student intake'))
    expect(screen.getByTestId('where')).toHaveTextContent('/administration/forms/f1')
  })
})
