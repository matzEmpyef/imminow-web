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

function setup(answers: Record<string, unknown> | null, fields: unknown[] = [EDUCATION], formName?: string) {
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
  vi.mocked(useFormTemplate).mockReturnValue({ isLoading: false, isError: false, data: { id: 'form-1', name: formName, fields } } as never)
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

// Owner rulings 2026-10-09: the tab honours each field's width (the builder's own six-column
// grid), and its heading is the form's own name, with the step named underneath.
describe('FormsTab layout and heading', () => {
  const field = (id: string, type: string, width: string | null, extra: Record<string, unknown> = {}) => ({
    id,
    type,
    label: id,
    required: false,
    position: 0,
    width,
    ...extra,
  })
  const cellOf = (label: string) => screen.getByText(label, { exact: false }).closest('div[class*="col-span"]') as HTMLElement

  it('puts half and third width fields on shared rows, inside groups too, and keeps tables and long text full', () => {
    setup(null, [
      field('Half A', 'text', 'half'),
      field('Third B', 'text', 'third'),
      field('Default C', 'text', null),
      field('Notes', 'long_text', 'half'),
      field('Grid', 'table', 'third', { table_columns: [column('c', 'text', 'Col')] }),
      field('Section', 'group', 'half', {
        fields: [field('Inner half', 'date', 'half'), field('Inner full', 'text', 'full')],
      }),
    ])
    renderTab()

    expect(cellOf('Half A')).toHaveClass('col-span-6', '@md:col-span-3')
    expect(cellOf('Third B')).toHaveClass('col-span-6', '@md:col-span-2')
    expect(cellOf('Default C')).toHaveClass('col-span-6')
    expect(cellOf('Default C')).not.toHaveClass('@md:col-span-3')
    // Long text, a table and a group take the whole row whatever their width says.
    for (const label of ['Notes', 'Grid', 'Section']) {
      expect(cellOf(label)).toHaveClass('col-span-6')
      expect(cellOf(label).className).not.toMatch(/@md:col-span/)
    }
    expect(cellOf('Inner half')).toHaveClass('@md:col-span-3')
    expect(cellOf('Inner full')).not.toHaveClass('@md:col-span-3')
    // The grid answers to the width of its own box, as the builder's preview does.
    expect(cellOf('Half A').parentElement).toHaveClass('@container', 'grid', 'grid-cols-6')
  })

  it('keeps required marks and Save as before', () => {
    setup({ name: 'Asha' }, [field('name', 'text', 'half', { required: true })])
    renderTab()
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Asha K' } })
    expect(sentAnswers()).toEqual({ name: 'Asha K' })
  })

  it("heads the tab with the form's own name and names the step underneath", () => {
    setup(null, [], 'Student Application Form')
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
                  { type: 'form_link', label: 'Form', payload: { form_template_id: 'form-1', form_name: 'Applicant Background Form' } },
                ],
              },
            ],
          },
        ],
      },
    } as never)
    renderTab()
    expect(screen.getByRole('heading', { name: 'Student Application Form' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Applicant Background Form' })).not.toBeInTheDocument()
    expect(screen.getByText('From step: Background')).toBeInTheDocument()
  })
})

// Owner ruling 2026-10-09: the checkbox spacing "looks random". Every field is a [label] over
// [control] block with one small gap, yes/no is a left-aligned segmented control under its label,
// and multi-select options wrap with a fixed gap. Values written stay exactly as before.
describe('FormsTab field spacing', () => {
  const field = (id: string, type: string, extra: Record<string, unknown> = {}) => ({
    id,
    type,
    label: id,
    required: false,
    position: 0,
    width: 'half',
    ...extra,
  })
  const blockOf = (label: string) => screen.getByText(label, { exact: false }).closest('label, div.flex-col') as HTMLElement

  it('puts the yes/no control under its label, left aligned, and writes the same words', () => {
    setup({ q: 'Yes' }, [field('q', 'yes_no'), field('Name', 'text')])
    renderTab()

    const block = blockOf('q')
    expect(block).toHaveClass('flex', 'flex-col', 'gap-xs')
    // Label first, control after it - not side by side at opposite ends of the row.
    expect(block.firstElementChild).toHaveTextContent('q')
    const control = within(block).getByRole('group', { name: 'q' })
    expect(block.lastElementChild).toBe(control)
    expect(control).toHaveClass('w-fit', 'h-9')
    expect(block.className).not.toMatch(/justify-between/)
    expect(within(control).getByRole('button', { name: 'Yes' })).toHaveAttribute('aria-pressed', 'true')
    expect(within(control).getByRole('button', { name: 'No' })).toHaveAttribute('aria-pressed', 'false')
    // Same block shape as the text field beside it, so the two line up.
    expect(blockOf('Name')).toHaveClass('flex', 'flex-col', 'gap-xs')

    fireEvent.click(within(control).getByRole('button', { name: 'No' }))
    expect(sentAnswers()).toEqual({ q: 'No' })
  })

  it('wraps multi-select options with fixed gaps, and a click on the option text toggles it', () => {
    setup({ topics: ['Maths'] }, [field('topics', 'multi_select', { options: ['Maths', 'Physics', 'Biology'] })])
    renderTab()

    const block = blockOf('topics')
    expect(block).toHaveClass('flex', 'flex-col', 'gap-xs')
    const options = block.lastElementChild as HTMLElement
    // Equal columns that fill the row, as many as fit (owner, 2026-10-09).
    expect(options).toHaveClass('grid', 'gap-x-md', 'gap-y-sm')
    expect((options as HTMLElement).style.gridTemplateColumns).toBe('repeat(auto-fit, minmax(9rem, 1fr))')
    expect(options.children).toHaveLength(3)
    for (const option of Array.from(options.children)) {
      // The whole option is one label with a fixed box-to-text gap.
      expect(option.tagName).toBe('LABEL')
      expect(option).toHaveClass('flex', 'items-center', 'gap-xs')
    }
    expect(screen.getByLabelText('Maths')).toBeChecked()

    fireEvent.click(screen.getByText('Physics'))
    expect(screen.getByLabelText('Physics')).toBeChecked()
    fireEvent.click(screen.getByText('Maths'))
    expect(sentAnswers()).toEqual({ topics: ['Physics'] })
  })

  it('spaces fields in a grid and a group card with one rhythm', () => {
    setup(null, [
      field('Section', 'group', { fields: [field('Inner', 'text')] }),
      field('Outer', 'text'),
    ])
    renderTab()

    const top = screen.getByText('Outer', { exact: false }).closest('div.grid') as HTMLElement
    expect(top).toHaveClass('gap-x-md', 'gap-y-md')
    const card = screen.getByText('Section', { selector: 'p' }).parentElement as HTMLElement
    expect(card).toHaveClass('flex', 'flex-col', 'gap-md', 'p-md')
    expect(card.querySelector('div.grid')).toHaveClass('gap-x-md', 'gap-y-md')
  })

  it('lays three third-width fields in one row, equal cells, every control the full cell width', () => {
    setup(null, [
      field('First name', 'text', { width: 'third' }),
      field('Date of birth', 'date', { width: 'third' }),
      field('Gender', 'single_select', { width: 'third', options: ['Female', 'Male'] }),
      field('Married', 'yes_no', { width: 'third' }),
    ])
    renderTab()

    const cells = ['First name', 'Date of birth', 'Gender'].map((label) => {
      const cell = screen.getByText(label, { exact: false }).closest('div[class*="col-span"]') as HTMLElement
      // Three to a row from the wide container size up, one column below it.
      expect(cell).toHaveClass('col-span-6', '@md:col-span-2', 'min-w-0')
      return cell
    })
    expect(new Set(cells.map((c) => c.parentElement)).size).toBe(1)
    expect(cells[0].parentElement).toHaveClass('@container', 'grid', 'grid-cols-6', 'gap-x-md')
    // Text, date and select all fill their cell, so the three line up edge to edge.
    expect(screen.getByLabelText('First name')).toHaveClass('w-full', 'h-9')
    expect(screen.getByLabelText('Date of birth')).toHaveClass('w-full', 'h-9')
    expect(screen.getByLabelText('Gender')).toHaveClass('w-full', 'h-9')
    // Every label sits directly above its control, in the same block shape.
    for (const label of ['First name', 'Date of birth', 'Gender']) {
      expect(blockOf(label)).toHaveClass('flex', 'flex-col', 'gap-xs')
    }
  })

  it('makes a text area as wide as its cell too', () => {
    setup(null, [field('Notes', 'long_text')])
    renderTab()
    expect(screen.getByLabelText('Notes')).toHaveClass('w-full')
  })

  it('looks the same on a closed case, just disabled', () => {
    setup({ q: 'No', topics: ['Maths'] }, [
      field('q', 'yes_no'),
      field('topics', 'multi_select', { options: ['Maths', 'Physics'] }),
    ])
    renderTab(true)

    expect(blockOf('q')).toHaveClass('flex', 'flex-col', 'gap-xs')
    expect(screen.getByRole('button', { name: 'No' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'No' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByLabelText('Maths')).toBeDisabled()
    expect(screen.getByLabelText('Maths')).toBeChecked()
  })
})
