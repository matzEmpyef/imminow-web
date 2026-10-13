import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

// T4-15: "From Library" waited on "Loading…" for ever on a Starter plan, which has no Document
// Library. The button is only offered where the plan includes the library.
const features = vi.hoisted(() => ({ library: true }))
vi.mock('@/lib/features', () => ({ useFeature: (key: string) => (key === 'document_library' ? features.library : false) }))
vi.mock('@/queries/uploads', () => ({
  useUploads: () => ({ data: { items: [], meta: { next_cursor: null } }, isLoading: false, isError: false }),
  useUploadFile: () => ({ mutate: vi.fn(), isPending: false, isError: false }),
  useDownloadUrl: () => ({ mutate: vi.fn() }),
}))
vi.mock('@/queries/studentDocuments', () => ({
  useStudentDocuments: () => ({ data: { items: [] }, isLoading: false, isError: false }),
}))
vi.mock('./ShareFromLibraryModal', () => ({ ShareFromLibraryModal: () => null }))
vi.mock('./UploadStudentDocumentModal', () => ({ UploadStudentDocumentModal: () => null }))

import { DocumentsTab } from './ClientProfileDocumentsTab'

describe('Documents tab — From Library', () => {
  it('is offered where the plan includes the Document Library', () => {
    features.library = true
    render(<DocumentsTab clientId="c1" />)
    expect(screen.getByRole('button', { name: 'From Library' })).toBeInTheDocument()
    expect(screen.getByText(/share one from your Document Library/)).toBeInTheDocument()
  })

  it('is not offered where it is not, and the empty line does not point at it', () => {
    features.library = false
    render(<DocumentsTab clientId="c1" />)
    expect(screen.queryByRole('button', { name: 'From Library' })).not.toBeInTheDocument()
    expect(screen.getByText('Nothing sent yet. Send a document to the student.')).toBeInTheDocument()
  })
})
