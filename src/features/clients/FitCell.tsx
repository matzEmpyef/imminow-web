import { Badge } from '@/components/Badge'
import type { components } from '@/api/schema'

type Fit = components['schemas']['CourseEligibility']

// The failed-rule detail line plan §4.1 asks for ("a red row reads 'IELTS band 5.5 < 6.0
// required'") — pass and unknown rows omitted, so a consultant reads the gap without opening
// anything. `borderline` is gone from the contract (2026-09-19, owner: "drop borderline, show
// shortfall") — a rule now passes, fails with a stated shortfall, or is unknown.
function failingRules(fit: Fit) {
  return (fit.rules ?? []).filter((r) => r.result === 'fail')
}

// Grade Match for one course against one person. Its own file since 2026-09-14, when Suggest a
// course in chat started showing it too — Course Finder's columns module exports a factory, so a
// component exported from there broke fast refresh.
export function FitCell({ fit }: { fit: Fit | null | undefined }) {
  if (!fit) return <span className="text-body-sm text-text-secondary">No requirements published</span>
  const problems = failingRules(fit)
  const pending = fit.pending ?? []
  let badge
  if (fit.verdict === 'meets') {
    badge = <Badge color="success">{fit.provisional ? 'Provisionally meets' : 'Meets requirements'}</Badge>
  } else if (fit.verdict === 'meets_so_far') {
    // Never "Meets requirements": every rule there is data for passes, but something is still
    // unknown, so the badge states how much was actually checked (contract, 2026-09-19).
    badge = (
      <Badge color="warning">
        Meets {fit.checks_evaluated} of {fit.checks_total} checked
      </Badge>
    )
  } else if (fit.verdict === 'below') {
    badge = <Badge color="error">Below requirements</Badge>
  } else {
    badge = <Badge color="primary">Profile incomplete</Badge>
  }
  return (
    <div className="flex flex-col gap-xs">
      <span>
        {badge}
        <span className="ml-xs text-caption text-text-secondary">
          {fit.checks_evaluated}/{fit.checks_total} checks
        </span>
      </span>
      {fit.verdict == null && pending.length > 0 && (
        <span className="text-caption text-text-secondary">Missing: {pending.join(', ')}</span>
      )}
      {problems.map((r, i) => (
        // Suggesting a fix for the requirement ITSELF (a college-published fact, not the
        // applicant's own score) lives on the course's own detail popup, alongside every other
        // correctable fact about the course (user, 2026-08-24) — click the course name to open it.
        <span key={i} className="text-caption text-text-secondary">
          {r.label}: {r.yours ?? '—'} vs {r.requirement} required
          {r.shortfall ? ` — ${r.shortfall}` : ''}
        </span>
      ))}
      {fit.intake_note && <span className="text-caption text-warning">{fit.intake_note}</span>}
    </div>
  )
}
