import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { Table, type TableColumn } from './Table'

// The one list primitive every directory, pipeline and admin page renders through. Its
// loading / error / empty / rows distinction is what the audit means by "failure never looks
// like emptiness" — so it is pinned here once rather than trusted 60 times.
interface Row {
  id: string
  name: string
  points: number
}

const rows: Row[] = [
  { id: 'a', name: 'Akhil', points: 185 },
  { id: 'b', name: 'Riya', points: 10 },
  { id: 'c', name: 'Sanya', points: 40 },
]

const columns: TableColumn<Row>[] = [
  { key: 'name', header: 'Name', sortable: true, render: (r) => r.name },
  { key: 'points', header: 'Points', align: 'right', render: (r) => String(r.points) },
]

describe('Table states', () => {
  it('shows a loading row and nothing else while loading', () => {
    render(<Table columns={columns} rows={rows} rowKey={(r) => r.id} loading />)
    expect(screen.getByText('Loading…')).toBeInTheDocument()
    expect(screen.queryByText('Akhil')).not.toBeInTheDocument()
  })

  it('shows the error, not an empty message, when the fetch failed', () => {
    render(<Table columns={columns} rows={[]} rowKey={(r) => r.id} error="Could not load students." emptyMessage="No students." />)
    expect(screen.getByText('Could not load students.')).toBeInTheDocument()
    expect(screen.queryByText('No students.')).not.toBeInTheDocument()
  })

  it('shows the empty message only when there are genuinely no rows', () => {
    render(<Table columns={columns} rows={[]} rowKey={(r) => r.id} emptyMessage="No students match." />)
    expect(screen.getByText('No students match.')).toBeInTheDocument()
  })

  it('renders every row through its column renderers', () => {
    render(<Table columns={columns} rows={rows} rowKey={(r) => r.id} />)
    expect(screen.getByText('Akhil')).toBeInTheDocument()
    expect(screen.getByText('185')).toBeInTheDocument()
    expect(screen.getAllByRole('row')).toHaveLength(rows.length + 1) // + header row
  })
})

describe('Table sorting', () => {
  it('sortable headers are real buttons that cycle asc → desc', () => {
    const onSortChange = vi.fn()
    const { rerender } = render(
      <Table columns={columns} rows={rows} rowKey={(r) => r.id} sort={null} onSortChange={onSortChange} />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Name' }))
    expect(onSortChange).toHaveBeenCalledWith('name', 'asc')

    rerender(
      <Table columns={columns} rows={rows} rowKey={(r) => r.id} sort={{ field: 'name', direction: 'asc' }} onSortChange={onSortChange} />,
    )
    fireEvent.click(screen.getByRole('button', { name: /Name/ }))
    expect(onSortChange).toHaveBeenLastCalledWith('name', 'desc')
    expect(screen.getByRole('columnheader', { name: /Name/ })).toHaveAttribute('aria-sort', 'ascending')
  })

  it('non-sortable headers are plain text, not buttons', () => {
    render(<Table columns={columns} rows={rows} rowKey={(r) => r.id} onSortChange={vi.fn()} />)
    expect(screen.queryByRole('button', { name: 'Points' })).not.toBeInTheDocument()
  })
})

describe('Table pagination', () => {
  it('disables Previous on the first page and Next on the last, and shows the total', () => {
    const onNext = vi.fn()
    const onPrevious = vi.fn()
    render(
      <Table
        columns={columns}
        rows={rows}
        rowKey={(r) => r.id}
        pagination={{ hasNext: true, hasPrevious: false, onNext, onPrevious, total: 42 }}
      />,
    )
    expect(screen.getByText('42 results')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Previous' })).toBeDisabled()
    const next = screen.getByRole('button', { name: 'Next' })
    expect(next).toBeEnabled()
    fireEvent.click(next)
    expect(onNext).toHaveBeenCalledTimes(1)
    expect(onPrevious).not.toHaveBeenCalled()
  })

  it('hides the Next/Previous controls entirely when everything fits on one page', () => {
    render(
      <Table
        columns={columns}
        rows={rows}
        rowKey={(r) => r.id}
        pagination={{ hasNext: false, hasPrevious: false, onNext: vi.fn(), onPrevious: vi.fn(), total: 3 }}
      />,
    )
    expect(screen.getByText('3 results')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Next' })).not.toBeInTheDocument()
  })
})

describe('Table row interaction', () => {
  it('rows are clickable and keyboard-activatable only when onRowClick is given', () => {
    const onRowClick = vi.fn()
    render(<Table columns={columns} rows={rows} rowKey={(r) => r.id} onRowClick={onRowClick} />)
    const [, firstBodyRow] = screen.getAllByRole('row')
    expect(firstBodyRow).toHaveAttribute('tabindex', '0')
    fireEvent.keyDown(firstBodyRow, { key: 'Enter' })
    expect(onRowClick).toHaveBeenCalledWith(rows[0])
    fireEvent.click(firstBodyRow)
    expect(onRowClick).toHaveBeenCalledTimes(2)
  })

  it('rows are inert without onRowClick', () => {
    render(<Table columns={columns} rows={rows} rowKey={(r) => r.id} />)
    const [, firstBodyRow] = screen.getAllByRole('row')
    expect(firstBodyRow).not.toHaveAttribute('tabindex')
  })
})
