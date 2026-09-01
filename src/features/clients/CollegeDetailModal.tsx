import { Modal } from '@/components/Modal'
import { useCourses } from '@/queries/courseSuggestions'
import type { components } from '@/api/schema'

type College = components['schemas']['College']

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-md">
      <dt className="shrink-0 text-text-secondary">{label}</dt>
      <dd className="min-w-0 text-right text-text-primary">{value}</dd>
    </div>
  )
}

/**
 * The whole college, read-only, reached by clicking a college name from wherever one appears in
 * a result row — first Course Finder (user, 2026-08-23: "consultant should be able to see the
 * whole college detail. show details in popup"). Same pattern as {@link EventDetailsModal}: a
 * plain `Modal` with a `dl`, no edit affordance, since a consultant browsing results has no
 * business editing the catalog — that stays on Colleges & Courses.
 *
 * Pulls in every course at this college via `useCourses({ collegeId })` — the same call
 * `CollegeDetailPage` itself already makes — so a consultant on a call can see what ELSE the
 * university offers without leaving the results they were looking at.
 */
export function CollegeDetailModal({ college, onClose }: { college: College; onClose: () => void }) {
  const courses = useCourses({ collegeId: college.id })

  return (
    <Modal onClose={onClose} title={college.name ?? ''} widthRem={34}>
      <div className="flex flex-col gap-md">
        <div className="flex items-center gap-sm">
          {college.logo_url ? (
            <img src={college.logo_url} alt="" className="h-10 w-10 shrink-0 rounded-md bg-background object-cover" />
          ) : (
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-background text-body-sm font-medium text-text-secondary">
              {(college.name ?? '?').charAt(0).toUpperCase()}
            </div>
          )}
          <div className="min-w-0">
            {college.website && (
              <a
                href={college.website}
                target="_blank"
                rel="noreferrer"
                className="truncate text-body-sm text-primary hover:underline"
              >
                {college.website}
              </a>
            )}
          </div>
        </div>

        {college.description && <p className="text-body-sm text-text-secondary">{college.description}</p>}

        <dl className="flex flex-col gap-xs text-body-sm">
          {college.institution_type && (
            <Row label="Type" value={<span className="capitalize">{college.institution_type}</span>} />
          )}
          {college.qs_rank != null && <Row label="QS rank" value={college.qs_rank} />}
          {college.the_rank != null && <Row label="THE rank" value={college.the_rank} />}
          {college.acceptance_rate != null && <Row label="Acceptance rate" value={`${college.acceptance_rate}%`} />}
        </dl>

        {college.campuses && college.campuses.length > 0 && (
          <div className="flex flex-col gap-xs border-t border-border pt-sm">
            <span className="text-body-sm font-medium text-text-primary">Campuses</span>
            {college.campuses.map((campus) => (
              <p key={campus.id} className="text-body-sm text-text-secondary">
                {[campus.city, campus.province_state, campus.country].filter(Boolean).join(', ')}
              </p>
            ))}
          </div>
        )}

        <div className="flex flex-col gap-xs border-t border-border pt-sm">
          <span className="text-body-sm font-medium text-text-primary">
            Courses{courses.data?.meta.total != null ? ` (${courses.data.meta.total})` : ''}
          </span>
          {courses.isLoading && <p className="text-body-sm text-text-secondary">Loading…</p>}
          {/* H10 fix (frontend review, 1 Sep 2026) — a failed fetch used to fall through to "No
              courses listed", indistinguishable from a college that genuinely has none yet. */}
          {courses.isError && (
            <div className="flex items-center justify-between gap-sm">
              <p className="text-body-sm text-error">Could not load courses.</p>
              <button
                type="button"
                onClick={() => courses.refetch()}
                className="text-body-sm text-primary hover:underline"
              >
                Retry
              </button>
            </div>
          )}
          {!courses.isError && courses.data?.items.length === 0 && (
            <p className="text-body-sm text-text-secondary">No courses listed for this college yet.</p>
          )}
          <ul className="flex flex-col gap-xs">
            {!courses.isError &&
              courses.data?.items.map((c) => (
                <li key={c.id} className="flex items-center justify-between gap-sm text-body-sm">
                  <span className="min-w-0 truncate text-text-primary">{c.name}</span>
                  <span className="shrink-0 text-caption text-text-secondary">{c.level}</span>
                </li>
              ))}
          </ul>
        </div>
      </div>
    </Modal>
  )
}
