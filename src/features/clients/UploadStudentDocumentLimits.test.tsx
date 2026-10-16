import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// Decision 154, ruling 9: a file is checked for type and size before it is sent, and the one
// shared sentence says what is accepted.
const upload = vi.hoisted(() => ({ mutate: vi.fn(), isPending: false, isError: false, error: null as unknown }))

vi.mock('@/queries/studentDocuments', () => ({
  useStudentDocuments: () => ({
    data: {
      types: [
        { id: 'passport', name: 'Passport', cardinality: 'singleton', expires: false, allowed_mime_types: ['application/pdf', 'image/jpeg'], max_size_mb: 5 },
        { id: 'letter', name: 'Letter', cardinality: 'instance', expires: true, allowed_mime_types: [], max_size_mb: 15 },
      ],
    },
  }),
  useUploadStudentDocument: () => upload,
}))

import { UploadStudentDocumentModal } from './UploadStudentDocumentModal'

const DOCUMENT_SENTENCE = 'Choose a PDF, JPEG, PNG, WebP or Word (.docx) file of up to 15 MB.'
const MB = 1024 * 1024

beforeEach(() => {
  vi.clearAllMocks()
})

function pick(type: string, name: string, size = 1000) {
  const file = new File(['x'], name, { type })
  Object.defineProperty(file, 'size', { value: size })
  fireEvent.change(screen.getByLabelText('File'), { target: { files: [file] } })
}

function open(documentId = 'letter') {
  render(<UploadStudentDocumentModal clientId="c1" onClose={() => {}} />)
  fireEvent.change(screen.getByLabelText('Document'), { target: { value: documentId } })
}

describe('upload for the student', () => {
  it('refuses a web page with the one document sentence and keeps Upload off', () => {
    open()
    pick('text/html', 'page.html')
    expect(screen.getByRole('alert')).toHaveTextContent(DOCUMENT_SENTENCE)
    expect(screen.getByRole('button', { name: 'Upload' })).toBeDisabled()
  })

  it('refuses a file over 15 MB', () => {
    open()
    pick('application/pdf', 'big.pdf', 16 * MB)
    expect(screen.getByRole('alert')).toHaveTextContent(DOCUMENT_SENTENCE)
  })

  it('refuses an empty file', () => {
    open()
    pick('application/pdf', 'empty.pdf', 0)
    expect(screen.getByRole('alert')).toBeInTheDocument()
  })

  it('also holds the file to the chosen document’s own types and size', () => {
    open('passport')
    pick('image/png', 'scan.png', 1000)
    expect(screen.getByRole('alert')).toHaveTextContent(/for this document/)
    pick('application/pdf', 'scan.pdf', 6 * MB)
    expect(screen.getByRole('alert')).toHaveTextContent(/up to 5 MB for this document/)
  })

  it('takes a PDF within the limits', () => {
    open('passport')
    pick('application/pdf', 'scan.pdf', 2 * MB)
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Upload' })).toBeEnabled()
  })

  it('bounds the expiry date to 1900 and 2100', () => {
    open('letter')
    const expiry = screen.getByLabelText('Expires on')
    expect(expiry).toHaveAttribute('min', '1900-01-01')
    expect(expiry).toHaveAttribute('max', '2100-12-31')
  })
})
