import { describe, expect, it } from 'vitest'
import { uploadAccept, uploadProblem, uploadSentence } from './uploadRules'

const MB = 1024 * 1024

function file(type: string, size: number) {
  return { type, size }
}

describe('uploadProblem', () => {
  it('takes a document up to 15 MB of PDF, JPEG, PNG, WebP or Word', () => {
    for (const type of [
      'application/pdf',
      'image/jpeg',
      'image/png',
      'image/webp',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    ]) {
      expect(uploadProblem(file(type, 15 * MB), 'document')).toBeNull()
    }
  })

  it('refuses a document over 15 MB, an empty one, and one of another type, with the one sentence', () => {
    const sentence = 'Choose a PDF, JPEG, PNG, WebP or Word (.docx) file of up to 15 MB.'
    expect(uploadSentence('document')).toBe(sentence)
    expect(uploadProblem(file('application/pdf', 15 * MB + 1), 'document')).toBe(sentence)
    expect(uploadProblem(file('application/pdf', 0), 'document')).toBe(sentence)
    expect(uploadProblem(file('text/html', 100), 'document')).toBe(sentence)
    expect(uploadProblem(file('image/svg+xml', 100), 'document')).toBe(sentence)
    expect(uploadProblem(file('application/msword', 100), 'document')).toBe(sentence)
    expect(uploadProblem(file('', 100), 'document')).toBe(sentence)
  })

  it('holds a KYC file to 10 MB and no Word files', () => {
    expect(uploadProblem(file('application/pdf', 10 * MB), 'kyc')).toBeNull()
    expect(uploadProblem(file('application/pdf', 10 * MB + 1), 'kyc')).toBe(uploadSentence('kyc'))
    expect(
      uploadProblem(
        file('application/vnd.openxmlformats-officedocument.wordprocessingml.document', 100),
        'kyc',
      ),
    ).toBe(uploadSentence('kyc'))
  })

  it('holds an image to 5 MB and a gallery picture to 2 MB, images only', () => {
    expect(uploadProblem(file('image/png', 5 * MB), 'image')).toBeNull()
    expect(uploadProblem(file('image/png', 5 * MB + 1), 'image')).toBe(uploadSentence('image'))
    expect(uploadProblem(file('image/svg+xml', 100), 'image')).toBe(uploadSentence('image'))
    expect(uploadProblem(file('application/pdf', 100), 'image')).toBe(uploadSentence('image'))
    expect(uploadProblem(file('image/webp', 2 * MB), 'gallery')).toBeNull()
    expect(uploadProblem(file('image/webp', 2 * MB + 1), 'gallery')).toBe(uploadSentence('gallery'))
  })

  it('offers the browser’s file dialog only the allowed types', () => {
    expect(uploadAccept('image')).toBe('image/jpeg,image/png,image/gif,image/webp')
    expect(uploadAccept('document')).toContain('application/pdf')
    expect(uploadAccept('document')).not.toContain('html')
  })
})
