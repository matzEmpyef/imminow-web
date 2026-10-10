import type { ReactNode } from 'react'
import { Card } from '@/components/Card'

/**
 * The frame of a page a student or parent opens from a message, with no account and no console
 * chrome (the guardian's approval, the emailed webinar link). It is Sentpo-branded in words only:
 * the person reading has never heard of immiNow, and a brand they have no relationship with is
 * how a legitimate message starts looking like phishing.
 */
export function PublicPageShell({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-md py-xl">
      <Card className="w-full max-w-[32rem] border border-border">
        <p className="text-caption uppercase tracking-wide text-text-secondary">Sentpo</p>
        <h1 className="mt-xs text-h1 text-text-primary">{title}</h1>
        <div className="mt-lg flex flex-col gap-md">{children}</div>
      </Card>
    </div>
  )
}
