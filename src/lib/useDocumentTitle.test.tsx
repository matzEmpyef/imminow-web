import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { useDocumentTitle } from './useDocumentTitle'

function Page({ title }: { title: string }) {
  useDocumentTitle(title)
  return null
}

describe('useDocumentTitle', () => {
  it('sets the tab title while the page is shown and restores the console title after', () => {
    document.title = 'immiNow'
    const { unmount } = render(<Page title="Sentpo: guardian approval" />)
    expect(document.title).toBe('Sentpo: guardian approval')
    unmount()
    expect(document.title).toBe('immiNow')
  })
})
