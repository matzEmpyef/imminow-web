import type { ReactNode } from 'react'

/** One titled panel of the Course and College detail popups — shared so the two keep reading as
 * a pair (Phase 5, W-DUP-10; the College popup was restyled to match the Course one 2026-09-10). */
export function DetailSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-md rounded-lg border border-border bg-background p-lg">
      <h3 className="text-h3 text-text-primary">{title}</h3>
      {children}
    </section>
  )
}
