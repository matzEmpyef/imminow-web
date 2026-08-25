import { useEffect, useRef, useState } from 'react'
import { Bold, Italic, Heading2, Heading3, List, ListOrdered, Quote, Link2, Eraser } from 'lucide-react'

interface RichTextEditorProps {
  value: string
  onChange: (html: string) => void
  placeholder?: string
  minHeightRem?: number
  /** Screen-reader name for the editable area — was hardcoded to "Article body", which was
   *  simply wrong on Country Guides. htmlFor can't reach a contentEditable div, so the name
   *  comes in as a prop instead. */
  ariaLabel?: string
}

/**
 * A SIMPLE rich text editor — headings, bold/italic, lists, quote, links (user, 2026-08-23:
 * "heading, bold, list... simple editor").
 *
 * Deliberately built on `contentEditable` and `document.execCommand` rather than pulling in a
 * WYSIWYG framework. The output only ever needs to be the handful of tags the mobile renderer
 * already understands — the same allow-list the blog sanitiser enforces (h2/h3/h4, p,
 * strong/em, ul/ol/li, blockquote, a) — so a full editor would be several hundred kilobytes to
 * produce markup we then throw most of away. `execCommand` is deprecated but universally
 * implemented, and the server sanitises everything on save regardless, so the worst a browser
 * quirk can do is produce a tag that gets stripped.
 *
 * The value is applied to the DOM only when it differs from what this component last EMITTED.
 * Writing `innerHTML` on every render would reset the caret to the start of the document on every
 * keystroke, which is the classic way a controlled contentEditable becomes unusable.
 */
export function RichTextEditor({
  value,
  onChange,
  placeholder,
  minHeightRem = 18,
  ariaLabel = 'Article body',
}: RichTextEditorProps) {
  const ref = useRef<HTMLDivElement>(null)
  // Starts as null, NOT as `value`. Seeding it with `value` made the mount-time effect below see
  // them as equal and skip writing, so opening an existing document showed an empty editor — and
  // saving from there would have wiped real content with nothing to warn you.
  const lastEmitted = useRef<string | null>(null)
  const [isEmpty, setIsEmpty] = useState(!value)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    if (value !== lastEmitted.current) {
      el.innerHTML = value
      lastEmitted.current = value
      setIsEmpty(!el.textContent?.trim())
    }
  }, [value])

  function emit() {
    const el = ref.current
    if (!el) return
    const html = el.innerHTML
    lastEmitted.current = html
    setIsEmpty(!el.textContent?.trim())
    onChange(html)
  }

  function run(command: string, argument?: string) {
    // Focus first: execCommand acts on the current selection, and a toolbar click moves focus to
    // the button, so without this the command applies to nothing.
    ref.current?.focus()
    document.execCommand(command, false, argument)
    emit()
  }

  function addLink() {
    const url = window.prompt('Link URL')
    if (!url) return
    run('createLink', url)
  }

  return (
    <div className="rounded-md border border-border">
      <div className="flex flex-wrap items-center gap-xs border-b border-border bg-background px-sm py-xs">
        <ToolButton
          label="Heading"
          onClick={() => run('formatBlock', '<h2>')}
          icon={<Heading2 className="h-4 w-4" />}
        />
        <ToolButton
          label="Subheading"
          onClick={() => run('formatBlock', '<h3>')}
          icon={<Heading3 className="h-4 w-4" />}
        />
        <Divider />
        <ToolButton label="Bold" onClick={() => run('bold')} icon={<Bold className="h-4 w-4" />} />
        <ToolButton label="Italic" onClick={() => run('italic')} icon={<Italic className="h-4 w-4" />} />
        <Divider />
        <ToolButton
          label="Bulleted list"
          onClick={() => run('insertUnorderedList')}
          icon={<List className="h-4 w-4" />}
        />
        <ToolButton
          label="Numbered list"
          onClick={() => run('insertOrderedList')}
          icon={<ListOrdered className="h-4 w-4" />}
        />
        <ToolButton
          label="Quote"
          onClick={() => run('formatBlock', '<blockquote>')}
          icon={<Quote className="h-4 w-4" />}
        />
        <Divider />
        <ToolButton label="Add link" onClick={addLink} icon={<Link2 className="h-4 w-4" />} />
        <ToolButton
          label="Clear formatting"
          onClick={() => {
            run('removeFormat')
            run('formatBlock', '<p>')
          }}
          icon={<Eraser className="h-4 w-4" />}
        />
      </div>
      <div className="relative">
        {isEmpty && placeholder && (
          <p className="pointer-events-none absolute left-sm top-sm text-body text-text-secondary">{placeholder}</p>
        )}
        {/* eslint-disable-next-line jsx-a11y/prefer-tag-over-role -- role="textbox" + aria-multiline is the ARIA-prescribed pattern for a contentEditable rich-text surface; <textarea> cannot host formatted content */}
        <div
          ref={ref}
          contentEditable
          suppressContentEditableWarning
          role="textbox"
          aria-multiline="true"
          aria-label={ariaLabel}
          onInput={emit}
          onBlur={emit}
          // Paste as PLAIN TEXT. A paste out of Word or a web page carries a mountain of inline
          // styles and wrapper tags; the server would strip them anyway, so taking the text here
          // means what the admin sees while editing is what actually gets saved.
          onPaste={(e) => {
            e.preventDefault()
            const text = e.clipboardData.getData('text/plain')
            document.execCommand('insertText', false, text)
            emit()
          }}
          style={{ minHeight: `${minHeightRem}rem` }}
          className="prose-editor w-full overflow-y-auto p-sm text-body outline-none"
        />
      </div>
    </div>
  )
}

function ToolButton({ label, onClick, icon }: { label: string; onClick: () => void; icon: React.ReactNode }) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      // `onMouseDown` with preventDefault, NOT onClick: a click steals focus from the editable
      // region first, which collapses the selection the command was meant to act on.
      onMouseDown={(e) => {
        e.preventDefault()
        onClick()
      }}
      className="flex h-8 w-8 items-center justify-center rounded-md text-text-secondary hover:bg-surface hover:text-text-primary"
    >
      {icon}
    </button>
  )
}

const Divider = () => <span className="mx-xs h-5 w-px bg-border" />
