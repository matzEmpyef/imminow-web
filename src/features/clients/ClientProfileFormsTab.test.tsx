import { fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// Forms tab, table fields (2026-10-08): a table shows the applicant's saved rows as a real table,
// each cell read by its column's type, and staff add, edit and remove rows through the same Save
// as every other field. The answer written is the app's own shape: a list of rows, each keyed by
// column id. The query hooks are mocked; what matters here is what is shown and what is sent.
vi.mock('@/queries/plans', () => ({
  usePlans: vi.fn(),
  useLatestFormResponse: vi.fn(),
  useSaveFormResponse: vi.fn(),
}))
vi.mock('@/queries/formTemplates', () => ({ useFormTemplate: vi.fn() }))
vi.mock('@/queries/clients', () => ({ useClient: vi.fn() }))

import { useLatestFormResponse, usePlans, useSaveFormResponse } from '@/queries/plans'
import { useFormTemplate } from '@/queries/formTemplates'
import { useClient } from '@/queries/clients'
import { FormsTab } from './ClientProfileFormsTab'

const mutate = vi.fn()

function column(id: string, type: string, label: string, extra: Record<string, unknown> = {}) {
  return { id, type, label, required: false, position: 0, ...extra }
}

const EDUCATION = {
  id: 'education',
  type: 'table',
  label: 'Education',
  required: true,
  position: 1,
  table_columns: [
    column('institution', 'text', 'Institution', { required: true }),
    column('notes', 'long_text', 'Notes'),
    column('completed', 'yes_no', 'Completed'),
    column('level', 'single_select', 'Level', { options: ['Bachelor', 'Master'] }),
    column('subjects', 'multi_select', 'Subjects', { options: ['Maths', 'Physics', 'Biology'] }),
    column('finished_on', 'date', 'Finished on'),
  ],
}

const FULL_ROW = {
  institution: 'Kerala University',
  notes: 'First class',
  completed: 'Yes',
  level: 'Bachelor',
  subjects: ['Maths', 'Physics'],
  finished_on: '2021-05-31',
}

function setup(answers: Record<string, unknown> | null, fields: unknown[] = [EDUCATION]) {
  vi.mocked(usePlans).mockReturnValue({
    isLoading: false,
    data: {
      items: [
        {
          steps: [
            {
              title: 'Background',
              position: 0,
              components: [{ type: 'form_link', label: 'Form', payload: { form_template_id: 'form-1', form_name: 'Student Application Form' } }],
            },
          ],
        },
      ],
    },
  } as never)
  vi.mocked(useFormTemplate).mockReturnValue({ isLoading: false, isError: false, data: { id: 'form-1', fields } } as never)
  vi.mocked(useLatestFormResponse).mockReturnValue({
    isLoading: false,
    data: answers ? { answers, submitted_at: '2026-10-01T10:00:00Z' } : null,
  } as never)
  vi.mocked(useSaveFormResponse).mockReturnValue({ mutate, isPending: false, error: null } as never)
  vi.mocked(useClient).mockReturnValue({ data: undefined } as never)
}

function renderTab(readOnly = false) {
  return render(
    <MemoryRouter>
      <FormsTab clientId="client-1" readOnly={readOnly} />
    </MemoryRouter>,
  )
}

function sentAnswers() {
  fireEvent.click(screen.getByRole('button', { name: 'Save' }))
  expect(mutate).toHaveBeenCalledTimes(1)
  return mutate.mock.calls[0][0] as Record<string, unknown>
}

beforeEach(() => {
  mutate.mockReset()
})

describe('FormsTab table fields', () => {
  it('shows each saved row as a table row, every cell read by its column type', () => {
    setup({ education: [FULL_ROW, { institution: 'MG College', completed: 'No', subjects: [] }] })
    renderTab()

    expect(screen.getAllByRole('columnheader').map((th) => th.textContent)).toEqual([
      'Institution *',
      'Notes',
      'Completed',
      'Level',
      'Subjects',
      'Finished on',
      'Actions',
    ])
    const [, first, second] = screen.getAllByRole('row')
    expect(within(first).getAllByRole('cell').slice(0, 6).map((td) => td.textContent)).toEqual([
      'Kerala University',
      'First class',
      'Yes',
      'Bachelor',
      'Maths, Physics',
      '31/05/2021',
    ])
    // Cells nobody filled, and an empty multi-select, read as a dash.
    expect(within(second).getAllByRole('cell').slice(0, 6).map((td) => td.textContent)).toEqual([
      'MG College',
      '—',
      'No',
      '—',
      '—',
      '—',
    ])
    expect(screen.getByText(/^Last saved/)).toBeInTheDocument()
  })

  it('says "No rows yet." for a table with nothing saved', () => {
    setup(null)
    renderTab()
    expect(screen.getByText('No rows yet.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled()
  })

  it('adds a row and sends the whole list, each row keyed by column id', () => {
    setup({ education: [FULL_ROW], other: 'kept' })
    renderTab()

    fireEvent.click(screen.getByRole('button', { name: 'Add row' }))
    const dialog = screen.getByRole('dialog', { name: 'Add row: Education' })
    // Nothing to add until a cell holds an answer.
    expect(within(dialog).getByRole('button', { name: 'Add row' })).toBeDisabled()
    fireEvent.change(within(dialog).getByLabelText(/^Institution/), { target: { value: 'IIT Madras' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'No' }))
    fireEvent.change(within(dialog).getByLabelText('Level'), { target: { value: 'Master' } })
    fireEvent.click(within(dialog).getByLabelText('Biology'))
    fireEvent.change(within(dialog).getByLabelText('Finished on'), { target: { value: '2023-06-30' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Add row' }))

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.getByText('IIT Madras')).toBeInTheDocument()
    expect(sentAnswers()).toEqual({
      other: 'kept',
      education: [
        FULL_ROW,
        { institution: 'IIT Madras', completed: 'No', level: 'Master', subjects: ['Biology'], finished_on: '2023-06-30' },
      ],
    })
  })

  it('edits a row in place and leaves the other rows as they were', () => {
    const second = { institution: 'MG College' }
    setup({ education: [FULL_ROW, second] })
    renderTab()

    fireEvent.click(screen.getByRole('button', { name: 'Edit row 1' }))
    const dialog = screen.getByRole('dialog', { name: 'Edit row 1: Education' })
    expect(within(dialog).getByLabelText(/^Institution/)).toHaveValue('Kerala University')
    fireEvent.change(within(dialog).getByLabelText('Notes'), { target: { value: 'Distinction' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Update row' }))

    expect(sentAnswers()).toEqual({ education: [{ ...FULL_ROW, notes: 'Distinction' }, second] })
  })

  it('removes a row only after the confirm', () => {
    setup({ education: [FULL_ROW, { institution: 'MG College' }] })
    renderTab()

    fireEvent.click(screen.getByRole('button', { name: 'Remove row 1' }))
    const confirm = screen.getByRole('dialog', { name: 'Remove row' })
    fireEvent.click(within(confirm).getByRole('button', { name: 'Cancel' }))
    expect(screen.getByText('Kerala University')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled()

    fireEvent.click(screen.getByRole('button', { name: 'Remove row 1' }))
    fireEvent.click(within(screen.getByRole('dialog', { name: 'Remove row' })).getByRole('button', { name: 'Remove' }))
    expect(screen.queryByText('Kerala University')).not.toBeInTheDocument()
    expect(sentAnswers()).toEqual({ education: [{ institution: 'MG College' }] })
  })

  it('is read-only on a read-only case: rows show, nothing can be added, changed or saved', () => {
    setup({ education: [FULL_ROW] })
    renderTab(true)

    expect(screen.getByText('Kerala University')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Add row' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Edit row 1' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Remove row 1' })).not.toBeInTheDocument()
    expect(screen.queryByRole('columnheader', { name: 'Actions' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Save' })).not.toBeInTheDocument()
  })

  it('marks a required table the way a required field is marked, and saves it with no rows as the server allows', () => {
    setup({ name: 'Asha' }, [{ id: 'name', type: 'text', label: 'Name', required: true, position: 0 }, EDUCATION])
    renderTab()

    // The table's label carries the same star as the required text field above it, in the same
    // title style a group section uses.
    const title = screen.getByText('Education', { selector: 'p' })
    expect(title).toHaveTextContent('Education *')
    expect(title).toHaveClass('text-body-sm', 'font-medium')
    // The server checks nothing inside `answers`, so an empty required table does not hold Save.
    fireEvent.change(screen.getByLabelText(/^Name/), { target: { value: 'Asha K' } })
    expect(sentAnswers()).toEqual({ name: 'Asha K' })
  })

  it('asks before the pager leaves a form with unsaved rows', () => {
    setup({ education: [FULL_ROW] })
    vi.mocked(usePlans).mockReturnValue({
      isLoading: false,
      data: {
        items: [
          {
            steps: [
              {
                title: 'Background',
                position: 0,
                components: [
                  { type: 'form_link', payload: { form_template_id: 'form-1', form_name: 'First form' } },
                  { type: 'form_link', payload: { form_template_id: 'form-2', form_name: 'Second form' } },
                ],
              },
            ],
          },
        ],
      },
    } as never)
    renderTab()

    fireEvent.click(screen.getByRole('button', { name: 'Remove row 1' }))
    fireEvent.click(within(screen.getByRole('dialog', { name: 'Remove row' })).getByRole('button', { name: 'Remove' }))
    fireEvent.click(screen.getByRole('button', { name: 'Next →' }))

    expect(screen.getByRole('dialog', { name: 'Discard your changes?' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'First form' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Discard' }))
    expect(screen.getByRole('heading', { name: 'Second form' })).toBeInTheDocument()
    // The next form opens on its own saved answers, not the edits left behind.
    expect(screen.getByText('Kerala University')).toBeInTheDocument()
  })
})
