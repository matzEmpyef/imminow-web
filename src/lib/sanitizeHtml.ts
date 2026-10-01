import DOMPurify from 'dompurify'

// Review Triage item 6 ("[W5 · blog] DOMPurify on blog preview", web M4) — defense in depth for
// server-rendered content. `mock-server/lib/articleContent.js` already reduces a blog article's
// body to a fixed tag allowlist before it ever reaches the client — the same allowlist the mobile
// app's `ArticleHtml` (mobile/lib/core/widgets/article_html.dart) documents and renders natively —
// with every style/class attribute stripped and href/src limited to http(s). This is a second,
// independent pass on the client: the server is trusted today, but a client that blindly
// `dangerouslySetInnerHTML`s whatever a "sanitised" field contains has no defense left the day
// that assumption is wrong (a CMS migration, a compromised admin account authoring a hostile
// article body, a future endpoint that reuses this field without the same server-side pass).
//
// Tags mirror the server/mobile allowlist exactly, plus the table substructure the mock's prose
// can contain (`table` without `tbody`/`tr`/`td`/`th` would otherwise render an empty box).
const ALLOWED_TAGS = [
  'h2',
  'h3',
  'h4',
  'p',
  'strong',
  'em',
  'a',
  'ul',
  'ol',
  'li',
  'blockquote',
  'table',
  'thead',
  'tbody',
  'tr',
  'td',
  'th',
  'img',
  'br',
]
const ALLOWED_ATTR = ['href', 'src', 'alt', 'title']

/**
 * Sanitises server-rendered article HTML before it is ever handed to `dangerouslySetInnerHTML`.
 * `javascript:`/`data:` hrefs and srcs, inline event handlers, and any tag/attribute outside the
 * allowlist above are stripped; DOMPurify's own default URI scheme regex already limits href/src
 * to http(s)/mailto/tel-shaped values, which is at least as strict as the server's http(s)-only
 * rule for this content.
 */
export function sanitizeArticleHtml(html: string | null | undefined): string {
  if (!html) return ''
  return DOMPurify.sanitize(html, { ALLOWED_TAGS, ALLOWED_ATTR })
}
