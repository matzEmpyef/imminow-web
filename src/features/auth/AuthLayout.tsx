import type { ReactNode } from 'react'
import { BRAND_LOGO } from '@/lib/brand'
import { Card } from '@/components/Card'

// ui-ux-design-web.md Section 1: the frosted-glass effect is used deliberately and sparingly,
// only on Login/modal/one hero panel — this is one of those three places.
export function AuthLayout({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-md">
      <Card className="w-full max-w-[24rem] border border-border bg-surface-glass backdrop-blur">
        <div className="flex flex-col items-center gap-sm">
          <img src={BRAND_LOGO} alt="immiNow" className="h-8 w-auto" />
          <h1 className="text-h1 text-text-primary">{title}</h1>
        </div>
        <div className="mt-lg flex flex-col gap-md">{children}</div>
      </Card>
    </div>
  )
}
