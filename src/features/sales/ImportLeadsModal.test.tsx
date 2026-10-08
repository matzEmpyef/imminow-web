import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

// Lead import skipped list (contract gate 7, owner Q7 2026-09-25) — duplicates are skipped rather
// than failing the whole import, and every skipped row is listed with `row_number` and a reason
// so nothing disappears silently.
vi.mock('@/queries/leads', () => ({
  useValidateLeadImport: vi.fn(() => ({ mutate: vi.fn(), data: undefined, isPending: false })),
  useCommitLeadImport: vi.fn(),
  useCreateLead: vi.fn(),
}))

import { useCommitLeadImport, useValidateLeadImport } from '@/queries/leads'
import { ImportLeadsModal } from './ImportLeadsModal'

type PreviewRow = {
  row_number: number
  name?: string
  valid: boolean
  phone?: string | null
  email?: string | null
  errors?: string[]
}

function withValidated(rows: PreviewRow[]) {
  vi.mocked(useValidateLeadImport).mockReturnValue({
    mutate: vi.fn(),
    isPending: false,
    data: {
      batch_id: 'batch-1',
      valid_count: rows.filter((r) => r.valid).length,
      invalid_count: rows.filter((r) => !r.valid).length,
      rows,
    },
  } as never)
}

function withCommitted(skipped: { row_number: number; reason: string }[], createdCount = 3) {
  vi.mocked(useCommitLeadImport).mockReturnValue({
    mutate: vi.fn(),
    isPending: false,
    isSuccess: true,
    isError: false,
    data: { created_count: createdCount, skipped },
  } as never)
}

describe('ImportLeadsModal — skipped rows', () => {
  it('lists every skipped row with its row number, name and a readable reason', () => {
    withValidated([
      { row_number: 2, name: 'Asha Rao', valid: true },
      { row_number: 5, name: 'Vikram Shah', valid: true },
    ])
    withCommitted([
      { row_number: 2, reason: 'duplicate_in_file' },
      { row_number: 5, reason: 'already_imported' },
    ])

    render(<ImportLeadsModal onClose={() => {}} />)

    expect(screen.getByText('3 leads imported into the Lead Pool.')).toBeInTheDocument()
    expect(screen.getByText('2 rows skipped — already there, so nothing was overwritten.')).toBeInTheDocument()
    expect(screen.getByText('Asha Rao')).toBeInTheDocument()
    expect(screen.getByText('Duplicate row in this file')).toBeInTheDocument()
    expect(screen.getByText('Vikram Shah')).toBeInTheDocument()
    expect(screen.getByText('Already an active lead')).toBeInTheDocument()
  })

  it('says nothing about skipped rows when every row was new', () => {
    withValidated([{ row_number: 1, name: 'Asha Rao', valid: true }])
    withCommitted([], 1)

    render(<ImportLeadsModal onClose={() => {}} />)

    expect(screen.getByText('leads imported into the Lead Pool.', { exact: false })).toBeInTheDocument()
    expect(screen.queryByText(/skipped/)).not.toBeInTheDocument()
  })
})

// Review F-208: each row's contacts are checked at the preview. A valid row shows the phone and
// email as the server will store them; a row that cannot be imported says why in its own words.
describe('ImportLeadsModal — the preview', () => {
  function preview(rows: PreviewRow[]) {
    withValidated(rows)
    vi.mocked(useCommitLeadImport).mockReturnValue({
      mutate: vi.fn(),
      reset: vi.fn(),
      isPending: false,
      isSuccess: false,
      isError: false,
    } as never)
    render(<ImportLeadsModal onClose={() => {}} />)
  }

  it('shows a valid row with the phone and email the server sent back', () => {
    preview([{ row_number: 1, name: 'Asha Rao', valid: true, phone: '+919876543210', email: 'asha@example.com' }])
    expect(screen.getByText('+919876543210')).toBeInTheDocument()
    expect(screen.getByText('asha@example.com')).toBeInTheDocument()
    expect(screen.getByText('Valid')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Import 1 Leads' })).toBeEnabled()
  })

  it('shows each refused row with the server’s own reasons', () => {
    preview([
      { row_number: 1, name: 'Asha Rao', valid: true, phone: '9876543210', email: null },
      { row_number: 2, name: 'Vikram Shah', valid: false, phone: '12', email: 'vikram@', errors: ['Phone is not a valid number.', 'Email is not a valid address.'] },
      { row_number: 3, name: 'N'.repeat(8), valid: false, errors: ['Name is at most 200 characters.'] },
    ])
    expect(screen.getByText('1 valid, 2 invalid of 3 rows.')).toBeInTheDocument()
    expect(screen.getByText('Phone is not a valid number. Email is not a valid address.')).toBeInTheDocument()
    expect(screen.getByText('Name is at most 200 characters.')).toBeInTheDocument()
    // A row with no contact to show reads as a dash, not as an empty cell.
    expect(screen.getAllByText('—').length).toBeGreaterThan(0)
  })

  it('still says a row cannot be imported when the server gave no reason', () => {
    preview([{ row_number: 1, name: 'Asha Rao', valid: false }])
    expect(screen.getByText('This row cannot be imported.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Import 0 Leads' })).toBeDisabled()
  })
})
