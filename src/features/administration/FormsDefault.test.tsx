import { fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// The default application form (owner decisions 30/31/59/60). Every consultancy has one form of
// its own marked `is_default`. Pinned here: the "Default" badge on its row; the question asked
// every time it is opened for editing (make a copy, or edit anyway); and Restore default, on the
// row, in the editor, and for the page when no form is the default.
vi.mock('@/features/auth/AppShell', () => ({ AppShell: ({ children }: { children: ReactNode }) => <div>{children}</div> }))
const access = vi.hoisted(() => ({ keys: ['settings.manage_templates'] as string[] }))
vi.mock('@/lib/permissions', () => ({
  usePermissionChecker: () => ({
    can: (key: string) => access.keys.includes(key),
    isAdmin: false,
    isLoading: false,
    isError: false,
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

import { showToast } from '@/lib/toast'
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

const EDIT_PROMPT =
  'This is your default form. We suggest making a copy and editing the copy, so you always have the original to go back to.'
const RESTORE_PROMPT =
  'Restore the default form? Its fields go back to the standard application form. Forms students have already filled in are not changed.'

const field = { id: 'a', label: 'First Name', type: 'text', required: true }
const DEFAULT_FORM = { id: 'd1', name: 'Student Application Form', version: 2, is_default: true, fields: [field] }
const OTHER_FORM = { id: 'f1', name: 'Student intake', version: 3, is_default: false, fields: [field] }
const COPY = { ...DEFAULT_FORM, id: 'copy1', is_default: false }
const RESTORED = { ...DEFAULT_FORM, id: 'd2', version: 3 }

const duplicate = vi.fn()
const restore = vi.fn()
/** Makes a mocked save answer at once with `result`, the way the real one does on success. */
function answers(mutate: typeof duplicate, result: unknown) {
  mutate.mockImplementation((_variables: unknown, options: { onSuccess: (data: unknown) => void }) =>
    options.onSuccess(result),
  )
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

function listOf(forms: unknown[]) {
  vi.mocked(useFormTemplates).mockReturnValue({ isLoading: false, isError: false, data: forms } as never)
}

beforeEach(() => {
  access.keys = ['settings.manage_templates']
  duplicate.mockReset()
  restore.mockReset()
  vi.mocked(showToast).mockReset()
  listOf([DEFAULT_FORM, OTHER_FORM])
  const byId: Record<string, unknown> = { d1: DEFAULT_FORM, f1: OTHER_FORM, copy1: COPY, d2: RESTORED }
  vi.mocked(useFormTemplate).mockImplementation(((id: string | undefined) => ({
    data: id ? byId[id] : undefined,
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  })) as never)
  const idle = { mutate: vi.fn(), isPending: false, isError: false, error: null, reset: vi.fn() }
  vi.mocked(useCreateFormTemplate).mockReturnValue(idle as never)
  vi.mocked(useUpdateFormTemplate).mockReturnValue(idle as never)
  vi.mocked(useDuplicateFormTemplate).mockReturnValue({ ...idle, mutate: duplicate } as never)
  vi.mocked(useRestoreDefaultFormTemplate).mockReturnValue({ ...idle, mutate: restore } as never)
})

describe('the Forms list', () => {
  it('counts the fields a person fills: each one inside a group, each one outside, a table as one', () => {
    const f = (id: string, type = 'text') => ({ id, label: id, type, required: false })
    listOf([
      {
        ...DEFAULT_FORM,
        fields: [
          { id: 'g1', label: 'Personal', type: 'group', required: false, fields: [f('a'), f('b'), f('c')] },
          { id: 'g2', label: 'Empty section', type: 'group', required: false, fields: [] },
          { id: 'g3', label: 'Education', type: 'group', required: false, fields: [f('d'), f('t', 'table')] },
          f('loose'),
          { ...f('tbl', 'table'), table_columns: [f('c1'), f('c2'), f('c3')] },
        ],
      },
      { ...OTHER_FORM, fields: [] },
    ])
    renderAt('/administration/forms')
    // 3 + 0 + 2 inside groups, 1 loose field, 1 table = 7 (not the 5 top-level entries).
    const cells = within(screen.getByText('Student Application Form').closest('tr')!).getAllByRole('cell')
    expect(cells[2]).toHaveTextContent(/^7$/)
    const other = within(screen.getByText('Student intake').closest('tr')!).getAllByRole('cell')
    expect(other[2]).toHaveTextContent(/^0$/)
  })

  it('marks the default form, and only it', () => {
    renderAt('/administration/forms')
    const defaultRow = screen.getByText('Student Application Form').closest('tr')!
    expect(within(defaultRow).getByText('Default')).toBeInTheDocument()
    expect(within(screen.getByText('Student intake').closest('tr')!).queryByText('Default')).not.toBeInTheDocument()
  })

  it('asks before the default form is edited, and "Edit anyway" opens its editor without asking again', () => {
    renderAt('/administration/forms')
    fireEvent.click(screen.getByRole('link', { name: 'Edit Student Application Form' }))
    expect(screen.getByText(EDIT_PROMPT)).toBeInTheDocument()
    expect(screen.getByTestId('where')).toHaveTextContent(/\/administration\/forms$/)

    fireEvent.click(screen.getByRole('button', { name: 'Edit anyway' }))
    expect(screen.getByTestId('where')).toHaveTextContent('/administration/forms/d1')
    expect(screen.queryByText(EDIT_PROMPT)).not.toBeInTheDocument()
    expect(screen.getByLabelText('Form name')).toHaveValue('Student Application Form')
  })

  it('"Make a copy" duplicates the default and opens the copy in the editor', () => {
    answers(duplicate, COPY)
    renderAt('/administration/forms')
    fireEvent.click(screen.getByText('Student Application Form'))
    fireEvent.click(screen.getByRole('button', { name: 'Make a copy' }))

    expect(duplicate).toHaveBeenCalledWith('d1', expect.anything())
    expect(screen.getByTestId('where')).toHaveTextContent('/administration/forms/copy1')
    expect(screen.queryByText(EDIT_PROMPT)).not.toBeInTheDocument()
    expect(screen.getByLabelText('Form name')).toBeInTheDocument()
  })

  it('opens any other form straight in its editor', () => {
    renderAt('/administration/forms')
    fireEvent.click(screen.getByText('Student intake'))
    expect(screen.getByTestId('where')).toHaveTextContent('/administration/forms/f1')
    expect(screen.queryByText(EDIT_PROMPT)).not.toBeInTheDocument()
  })

  it('restores the default from its row, and says so when a new version came back', () => {
    answers(restore, RESTORED)
    renderAt('/administration/forms')
    expect(screen.queryByRole('button', { name: 'Restore default Student intake' })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Restore default Student Application Form' }))
    expect(screen.getByText(RESTORE_PROMPT)).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Restore default' }))
    expect(restore).toHaveBeenCalledTimes(1)
    expect(showToast).toHaveBeenCalledWith('Default form restored.', 'success')
    expect(screen.queryByText(RESTORE_PROMPT)).not.toBeInTheDocument()
  })

  it('says the default is already the standard one when the same form came back', () => {
    answers(restore, DEFAULT_FORM)
    renderAt('/administration/forms')
    fireEvent.click(screen.getByRole('button', { name: 'Restore default Student Application Form' }))
    fireEvent.click(screen.getByRole('button', { name: 'Restore default' }))
    expect(showToast).toHaveBeenCalledWith('The default form is already the standard one.', 'info')
  })

  it('offers Restore default for the whole page only when no form is the default', () => {
    renderAt('/administration/forms')
    expect(screen.queryByRole('button', { name: 'Restore default' })).not.toBeInTheDocument()
  })

  it('recreates the default from the page when the consultancy has none', () => {
    listOf([OTHER_FORM])
    answers(restore, { ...DEFAULT_FORM, version: 1 })
    renderAt('/administration/forms')
    fireEvent.click(screen.getByRole('button', { name: 'Restore default' }))
    expect(screen.getByText(RESTORE_PROMPT)).toBeInTheDocument()
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Restore default' }))
    expect(showToast).toHaveBeenCalledWith('Default form restored.', 'success')
  })

  it('offers none of it without the permission to edit forms', () => {
    access.keys = []
    listOf([OTHER_FORM])
    renderAt('/administration/forms')
    expect(screen.queryByRole('button', { name: 'Restore default' })).not.toBeInTheDocument()
  })
})

describe('the form editor, opened on the default form', () => {
  it('asks before the editor shows when it is opened directly', () => {
    renderAt('/administration/forms/d1')
    expect(screen.getByText(EDIT_PROMPT)).toBeInTheDocument()
    expect(screen.queryByLabelText('Form name')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Edit anyway' }))
    expect(screen.getByLabelText('Form name')).toHaveValue('Student Application Form')
    expect(screen.getByRole('button', { name: 'Restore default' })).toBeInTheDocument()
  })

  it('goes back to the list when the question is closed without an answer', () => {
    renderAt('/administration/forms/d1')
    fireEvent.click(within(screen.getByRole('dialog')).getAllByRole('button', { name: 'Close' })[0])
    expect(screen.getByTestId('where')).toHaveTextContent(/\/administration\/forms$/)
  })

  it('does not ask, or offer Restore default, on any other form', () => {
    renderAt('/administration/forms/f1')
    expect(screen.queryByText(EDIT_PROMPT)).not.toBeInTheDocument()
    expect(screen.getByLabelText('Form name')).toHaveValue('Student intake')
    expect(screen.queryByRole('button', { name: 'Restore default' })).not.toBeInTheDocument()
  })

  it('moves on to the restored version after Restore default', () => {
    answers(restore, RESTORED)
    renderAt('/administration/forms/d1')
    fireEvent.click(screen.getByRole('button', { name: 'Edit anyway' }))
    fireEvent.click(screen.getByRole('button', { name: 'Restore default' }))
    expect(screen.getByText(RESTORE_PROMPT)).toBeInTheDocument()
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Restore default' }))

    expect(showToast).toHaveBeenCalledWith('Default form restored.', 'success')
    expect(screen.getByTestId('where')).toHaveTextContent('/administration/forms/d2')
    expect(screen.queryByText(EDIT_PROMPT)).not.toBeInTheDocument()
  })
})
