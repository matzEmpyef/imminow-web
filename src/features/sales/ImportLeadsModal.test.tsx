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

function withValidated(rows: { row_number: number; name?: string; valid: boolean }[]) {
  vi.mocked(useValidateLeadImport).mockReturnValue({
    mutate: vi.fn(),
    isPending: false,
    data: { batch_id: 'batch-1', valid_count: rows.length, invalid_count: 0, rows },
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
