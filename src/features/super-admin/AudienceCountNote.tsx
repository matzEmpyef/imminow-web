import { countOf } from '@/lib/counts'
import type { AudienceCount } from '@/queries/audienceCount'

/**
 * "Reaches about N students" — the one way the console shows an expected audience (owner decision
 * 20, 2026-10-07). TargetingFilter renders it under its fields, so every form with "who can see"
 * targeting has it; Broadcast also shows it for its two unfiltered audiences.
 *
 * Approximate by nature: it is the number at this moment. When there is no number (the form is
 * half filled in and the server has refused the document for now) nothing is drawn.
 */
export function AudienceCountNote({ audience, noun = 'students' }: { audience: AudienceCount; noun?: 'students' | 'staff' }) {
  if (audience.isCounting) return <p className="text-body-sm text-text-secondary">Counting…</p>
  if (audience.isError) return <p className="text-body-sm text-text-secondary">The count is not available right now.</p>
  if (audience.count == null) return null
  if (audience.count === 0) return <p className="text-body-sm text-error">Nobody matches these filters.</p>
  return (
    <p className="text-body-sm text-text-secondary">
      Reaches about{' '}
      {noun === 'staff' ? countOf(audience.count, false, 'staff member', 'staff') : countOf(audience.count, false, 'student')}.
    </p>
  )
}
