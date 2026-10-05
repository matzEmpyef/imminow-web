import { describe, expect, it } from 'vitest'
import { sanitizeArticleHtml, sanitizeRichText, sanitizeRichTextForDisplay } from './sanitizeHtml'

function parse(html: string): HTMLElement {
  const host = document.createElement('div')
  // eslint-disable-next-line no-restricted-properties -- test harness: parsing the helper's OUTPUT to inspect it
  host.innerHTML = html
  return host
}

const HOSTILE = [
  '<script>window.__pwned = 1</script>',
  '<img src="x" onerror="window.__pwned = 1">',
  '<svg onload="window.__pwned = 1"><circle r="1"></circle></svg>',
  '<iframe src="https://evil.example"></iframe>',
  '<object data="https://evil.example/x.swf"></object>',
  '<embed src="https://evil.example/x.swf">',
  '<meta http-equiv="refresh" content="0;url=https://evil.example">',
  '<form action="https://evil.example"><input name="q"><button>go</button></form>',
  '<p style="position:fixed;inset:0;background:red" onclick="window.__pwned = 1" class="x" data-x="1">overlay</p>',
  '<a href="javascript:window.__pwned = 1">js link</a>',
  '<a href="data:text/html,<script>1</script>">data link</a>',
  '<table><tr><td>cell</td></tr></table>',
].join('')

describe.each([
  ['sanitizeRichText', sanitizeRichText],
  ['sanitizeRichTextForDisplay', sanitizeRichTextForDisplay],
])('%s', (_name, sanitize) => {
  it('leaves nothing that can run, embed, restyle or submit', () => {
    const root = parse(sanitize(HOSTILE))

    expect(root.querySelector('script, img, svg, iframe, object, embed, meta, form, input, button, table, style, link')).toBeNull()
    for (const el of root.querySelectorAll('*')) {
      for (const attr of el.attributes) {
        expect(attr.name).not.toMatch(/^on/)
        expect(['href', 'target', 'rel']).toContain(attr.name)
      }
    }
    for (const a of root.querySelectorAll('a')) expect(a.hasAttribute('href')).toBe(false)
    expect(root.textContent).not.toContain('__pwned')
    // The words inside a removed formatting wrapper are kept.
    expect(root.textContent).toContain('overlay')
    expect(root.textContent).toContain('cell')
  })

  it('keeps what the editor produces', () => {
    const html =
      '<h2>Heading</h2><h3>Sub</h3><p>A <strong>bold</strong> and <em>italic</em> line<br>second line</p>' +
      '<div>A <b>draft</b> <i>line</i></div>' +
      '<ul><li>one</li></ul><ol><li>two</li></ol><blockquote>quoted</blockquote>'
    expect(sanitize(html)).toBe(html)
  })

  it('keeps http(s) and protocol-relative links only', () => {
    const root = parse(
      sanitize(
        '<a href="https://example.com/a?b=1">s</a><a href="http://example.com">h</a><a href="//example.com">r</a>' +
          '<a href="mailto:a@b.c">m</a><a href="/relative">rel</a><a href=" JaVaScRiPt:alert(1)">j</a>',
      ),
    )
    const hrefs = [...root.querySelectorAll('a')].map((a) => a.getAttribute('href'))
    expect(hrefs).toEqual(['https://example.com/a?b=1', 'http://example.com', '//example.com', null, null, null])
  })

  it('returns an empty string for nothing', () => {
    expect(sanitize(null)).toBe('')
    expect(sanitize(undefined)).toBe('')
    expect(sanitize('')).toBe('')
  })
})

describe('link handling differs by sink', () => {
  const link = '<p><a href="https://example.com">site</a></p>'

  it('display: links open in a new tab with no opener', () => {
    const a = parse(sanitizeRichTextForDisplay(link)).querySelector('a')!
    expect(a.getAttribute('target')).toBe('_blank')
    expect(a.getAttribute('rel')).toBe('noopener noreferrer')
  })

  it('editor: nothing is added to the markup', () => {
    expect(sanitizeRichText(link)).toBe(link)
  })

  it('the display hook does not leak into the other helpers', () => {
    sanitizeRichTextForDisplay(link)
    expect(sanitizeRichText(link)).toBe(link)
    expect(sanitizeArticleHtml(link)).toBe(link)
  })
})

describe('sanitizeArticleHtml', () => {
  it('still allows the article tags the narrow list drops, minus anything that runs', () => {
    const root = parse(
      sanitizeArticleHtml('<table><tbody><tr><td>cell</td></tr></tbody></table><img src="https://example.com/a.png" alt="a" onerror="x()"><script>1</script>'),
    )
    expect(root.querySelector('table td')?.textContent).toBe('cell')
    expect(root.querySelector('img')?.getAttribute('src')).toBe('https://example.com/a.png')
    expect(root.querySelector('img')?.hasAttribute('onerror')).toBe(false)
    expect(root.querySelector('script')).toBeNull()
  })
})
