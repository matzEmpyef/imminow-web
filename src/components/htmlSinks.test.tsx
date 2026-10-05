import { render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { TextComponentContent } from './PlanComponentBlock'
import { RichTextEditor } from './RichTextEditor'

// The two places stored rich text is inserted as HTML (review F-032). Both used to trust the
// server's cleaning alone; each must now render hostile markup inert and keep real formatting.
const HOSTILE =
  '<p>Bring your <strong>passport</strong></p>' +
  '<script>window.__pwned = true</script>' +
  '<img src="x" onerror="window.__pwned = true">' +
  '<svg onload="window.__pwned = true"></svg>' +
  '<iframe src="https://evil.example"></iframe>' +
  '<p style="position:fixed;inset:0" onclick="window.__pwned = true">overlay</p>' +
  '<a href="javascript:window.__pwned = true">click</a>' +
  '<form action="https://evil.example"><input name="password"></form>'

const FORMATTED =
  '<h2>Before you fly</h2><p>Carry <strong>originals</strong> and <em>two copies</em>.</p>' +
  '<ul><li>Passport</li><li>Offer letter</li></ul><blockquote>Keep these in hand luggage.</blockquote>' +
  '<p><a href="https://example.com/checklist">Full checklist</a></p>'

function expectInert(root: HTMLElement) {
  expect(root.querySelector('script, img, svg, iframe, object, embed, meta, form, input')).toBeNull()
  for (const el of root.querySelectorAll('*')) {
    expect(el.getAttribute('style')).toBeNull()
    for (const attr of el.attributes) expect(attr.name).not.toMatch(/^on/)
  }
  for (const a of root.querySelectorAll('a')) expect(a.getAttribute('href') ?? '').not.toMatch(/^\s*javascript:/i)
  expect((window as unknown as { __pwned?: boolean }).__pwned).toBeUndefined()
}

afterEach(() => {
  delete (window as unknown as { __pwned?: boolean }).__pwned
})

describe('TextComponentContent (plan text as displayed)', () => {
  it('renders script-carrying markup inert', () => {
    const { container } = render(<TextComponentContent payload={{ format: 'html', content: HOSTILE }} />)
    expectInert(container)
    expect(screen.getByText('passport').tagName).toBe('STRONG')
    expect(screen.getByText('overlay').tagName).toBe('P')
  })

  it('keeps legitimate formatting, and opens links in a new tab', () => {
    const { container } = render(<TextComponentContent payload={{ format: 'html', content: FORMATTED }} />)
    expect(container.querySelector('h2')?.textContent).toBe('Before you fly')
    expect(container.querySelector('strong')?.textContent).toBe('originals')
    expect(container.querySelector('em')?.textContent).toBe('two copies')
    expect(container.querySelectorAll('ul > li')).toHaveLength(2)
    expect(container.querySelector('blockquote')?.textContent).toBe('Keep these in hand luggage.')
    const link = screen.getByRole('link', { name: 'Full checklist' })
    expect(link).toHaveAttribute('href', 'https://example.com/checklist')
    expect(link).toHaveAttribute('target', '_blank')
    expect(link).toHaveAttribute('rel', 'noopener noreferrer')
  })

  it('plain-text components are never treated as HTML', () => {
    const { container } = render(<TextComponentContent payload={{ content: '<script>window.__pwned = true</script>' }} />)
    expect(container.querySelector('script')).toBeNull()
    expect(container.textContent).toContain('<script>')
  })
})

describe('RichTextEditor (stored text loaded for editing)', () => {
  it('loads script-carrying markup inert', () => {
    render(<RichTextEditor value={HOSTILE} onChange={() => {}} ariaLabel="Content" />)
    const editor = screen.getByRole('textbox', { name: 'Content' })
    expectInert(editor)
    expect(editor.querySelector('strong')?.textContent).toBe('passport')
    expect(editor.textContent).toContain('overlay')
  })

  it('keeps legitimate formatting exactly as stored', () => {
    render(<RichTextEditor value={FORMATTED} onChange={() => {}} ariaLabel="Content" />)
    const editor = screen.getByRole('textbox', { name: 'Content' })
    // eslint-disable-next-line no-restricted-properties -- reading the editor's DOM back to compare
    expect(editor.innerHTML).toBe(FORMATTED)
  })

  it('does not rewrite the DOM (and the caret) for the value it just emitted', () => {
    const onChange = vi.fn()
    const { rerender } = render(<RichTextEditor value="<p>one</p>" onChange={onChange} ariaLabel="Content" />)
    const editor = screen.getByRole('textbox', { name: 'Content' })
    const paragraph = editor.querySelector('p')

    // What a parent does with onChange: hand the emitted HTML straight back as `value`.
    rerender(<RichTextEditor value="<p>one</p>" onChange={onChange} ariaLabel="Content" />)
    expect(editor.querySelector('p')).toBe(paragraph) // same node — nothing was re-inserted
  })
})
