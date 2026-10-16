import type { ChangeEvent, ComponentProps } from 'react'
import { CharCounter } from '@/components/CharCounter'
import { TEXT_RULES, charLength, clipChars, stripControlChars, type TextKind } from '@/lib/validation'

type LimitedTextAreaProps = ComponentProps<'textarea'> & {
  /** What the text is; gives the character limit (long text 5000, a reason or note 2000, chat 4000). */
  kind?: Extract<TextKind, 'reason' | 'erasureReason' | 'note' | 'longText' | 'chat' | 'title' | 'label'>
  /** Characters allowed (code points), when the kind's own limit is not the right one. */
  limit?: number
}

/**
 * A plain `<textarea>` (the caller keeps its own label and styling) that stops at the limit for its
 * kind, drops control characters, and shows the live "92 / 100" counter from 90% of the limit
 * (Phase 9, decision 154). The drop-in for the hand-labelled text areas that do not go through
 * `TextAreaField`; the limit is counted in characters, the same as everywhere else.
 */
export function LimitedTextArea({ kind = 'longText', limit, maxLength, value, onChange, ...props }: LimitedTextAreaProps) {
  const max = limit ?? maxLength ?? TEXT_RULES[kind].max

  function handleChange(e: ChangeEvent<HTMLTextAreaElement>) {
    const next = clipChars(stripControlChars(e.target.value), max)
    if (next !== e.target.value) e.target.value = next
    onChange?.(e)
  }

  return (
    <>
      <textarea {...props} value={value} onChange={handleChange} />
      <CharCounter count={charLength(typeof value === 'string' ? value : '')} limit={max} />
    </>
  )
}
