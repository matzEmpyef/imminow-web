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

// ── Rich text written in the console's own editor (plan and plan-template text, country
// write-ups) ──────────────────────────────────────────────────────────────────────────────────
// Narrower than articles on purpose (review F-032): `RichTextEditor` has no image or table tool,
// so those tags can only arrive in this content by a crafted request. The list is what the editor
// can put in its own DOM — the stored tags (h2/h3/h4, p, strong/em, lists, blockquote, a, br) plus
// what browsers emit before the server normalises it on save (`b`/`i` for bold/italic, `div` for
// a new line), so an unsaved draft handed back to the editor or shown in a builder preview keeps
// its shape. `href` is the only attribute, and only http(s) or protocol-relative — the server's
// own rule for this content (`backend/app/core/html.py`). No `style`, no `class`, no `data-*`.
const RICH_TEXT_TAGS = ['h2', 'h3', 'h4', 'p', 'div', 'br', 'strong', 'b', 'em', 'i', 'ul', 'ol', 'li', 'blockquote', 'a']
const RICH_TEXT_URI = /^(?:https?:)?\/\//i
const RICH_TEXT_CONFIG = {
  ALLOWED_TAGS: RICH_TEXT_TAGS,
  ALLOWED_ATTR: ['href'],
  ALLOWED_URI_REGEXP: RICH_TEXT_URI,
  ALLOW_DATA_ATTR: false,
  ALLOW_ARIA_ATTR: false,
}

/**
 * Cleans rich text before it is written into the editor's own DOM (`RichTextEditor`). Scripts,
 * event handlers, `style`, embeds (iframe/svg/object/embed/meta/form/img/table) and unsafe link
 * schemes are removed; text inside a removed formatting tag is kept. Nothing is added — what the
 * editor later emits is still for the server to decide.
 */
export function sanitizeRichText(html: string | null | undefined): string {
  if (!html) return ''
  return DOMPurify.sanitize(html, RICH_TEXT_CONFIG)
}

// Its own DOMPurify instance, so the link hook below applies to this one function and to nothing
// else that sanitises (hooks are per instance).
const displayPurify = DOMPurify(window)
displayPurify.addHook('afterSanitizeAttributes', (node) => {
  if (node.nodeName === 'A' && node.hasAttribute('href')) {
    node.setAttribute('target', '_blank')
    node.setAttribute('rel', 'noopener noreferrer')
  }
})

/**
 * `sanitizeRichText` for READ-ONLY display (`TextComponentContent`): the same cleaning, and every
 * link opens in a new tab without a handle on the console's window — a link in a plan must not
 * navigate the console away from the record the consultant has open.
 */
export function sanitizeRichTextForDisplay(html: string | null | undefined): string {
  if (!html) return ''
  return displayPurify.sanitize(html, RICH_TEXT_CONFIG)
}
