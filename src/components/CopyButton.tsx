import { useEffect, useRef, useState } from 'react'
import { Check, Copy } from 'lucide-react'
import { showToast } from '@/lib/toast'

// The console's one copy-to-clipboard control for a person's or organisation's email address or
// phone number shown in a side drawer, a detail window or a profile page (owner, 2026-10-06). One
// click copies the exact value, the icon turns into a tick for two seconds, and a clipboard that is
// missing or refuses gets the standard error toast instead of a thrown error. Kept out of table
// and list rows on purpose — the owner excluded them to avoid clutter. Sized 20px with a 12px icon
// (trimmed from 24px / 14px, owner follow-up 2026-10-06).

const CONFIRM_MS = 2000

type CopyKind = 'email' | 'phone'

const KIND_LABEL: Record<CopyKind, string> = {
  email: 'email address',
  phone: 'phone number',
}

export function CopyButton({ value, kind, className = '' }: { value: string; kind: CopyKind; className?: string }) {
  const [copied, setCopied] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current)
    },
    [],
  )

  async function copy(e: React.MouseEvent<HTMLButtonElement>) {
    // A copy click is never a click on the row or card around the value.
    e.stopPropagation()
    try {
      await navigator.clipboard.writeText(value)
    } catch {
      showToast('Could not copy', 'error')
      return
    }
    setCopied(true)
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => setCopied(false), CONFIRM_MS)
  }

  const Icon = copied ? Check : Copy
  return (
    <>
      <button
        type="button"
        onClick={copy}
        aria-label={`Copy ${KIND_LABEL[kind]}`}
        title={copied ? 'Copied' : `Copy ${KIND_LABEL[kind]}`}
        className={`inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-md hover:bg-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
          copied ? 'text-success' : 'text-text-secondary hover:text-text-primary'
        } ${className}`}
      >
        <Icon className="h-3 w-3" />
      </button>
      <span role="status" className="sr-only">
        {copied ? 'Copied' : ''}
      </span>
    </>
  )
}

/**
 * A mailto:/tel: link with the copy control beside it — the placement every drawer shares.
 * `className` styles the link text only, so each drawer keeps its own size and truncation.
 */
export function ContactLink({ kind, value, className = '' }: { kind: CopyKind; value: string; className?: string }) {
  return (
    <span className="flex min-w-0 items-center gap-xs">
      <a href={`${kind === 'email' ? 'mailto' : 'tel'}:${value}`} className={`min-w-0 ${className}`}>
        {value}
      </a>
      <CopyButton value={value} kind={kind} />
    </span>
  )
}
