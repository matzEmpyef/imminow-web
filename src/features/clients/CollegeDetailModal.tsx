import type { ReactNode } from 'react'
import { BookOpen, ExternalLink, Landmark, MapPin, Medal, Percent, Trophy } from 'lucide-react'
import { Modal } from '@/components/Modal'
import { CountryLabel } from '@/components/CountryLabel'
import { Badge } from '@/components/Badge'
import { IconBadge } from '@/components/IconBadge'
import { SuggestCorrectionButton } from '@/features/clients/SuggestCorrectionButton'
import { useCourses } from '@/queries/courseSuggestions'
import type { components } from '@/api/schema'

type College = components['schemas']['College']
type IconColor = 'primary' | 'secondary' | 'success' | 'warning' | 'error' | 'info'

const INSTITUTION_TYPE_LABELS: Record<string, string> = {
  university: 'University',
  college: 'College',
  institute: 'Institute',
}

function Fact({ icon, color, label, children }: { icon: ReactNode; color: IconColor; label: string; children: ReactNode }) {
  return (
    <div className="flex min-w-0 items-start gap-sm">
      <IconBadge color={color}>{icon}</IconBadge>
      <div className="min-w-0">
        <p className="text-caption text-text-secondary">{label}</p>
        <div className="text-body-sm font-medium text-text-primary">{children}</div>
      </div>
    </div>
  )
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-md rounded-lg border border-border bg-background p-lg">
      <h3 className="text-h3 text-text-primary">{title}</h3>
      {children}
    </section>
  )
}

/**
 * The whole college, reached by clicking a college name in Course Finder (user, 2026-08-23).
 * Restyled 2026-09-10 to match CourseDetailModal ("similarly update college details popup too"):
 * an identity header, a Key Details panel of icon tiles, Campuses and Courses panels.
 *
 * Same missing-data rule as the course popup: every fact the catalogue keeps about a college is
 * shown, and a missing one reads "Not provided" with "+ Add", which files a suggestion through
 * POST /colleges/{id}/suggest-correction into the same review queue as course corrections. Known
 * values carry the correction pencil. Counts (campuses, courses) are derived, so they get neither.
 *
 * Still pulls in every course at this college via `useCourses({ collegeId })`, so a consultant on a
 * call can see what ELSE the university offers without leaving their results.
 */
export function CollegeDetailModal({ college, onClose }: { college: College; onClose: () => void }) {
  const courses = useCourses({ collegeId: college.id })

  // Every missing field rendered below registers here, so the notice's count matches the popup.
  const gaps: string[] = []
  function gap(field: string, label: string, text = 'Not provided') {
    gaps.push(label)
    return (
      <span className="inline-flex flex-wrap items-center gap-xs font-normal">
        <span className="italic text-text-secondary">{text}</span>
        <SuggestCorrectionButton collegeId={college.id} field={field} label={label} current={null} />
      </span>
    )
  }
  function show(value: string | null | undefined, field: string, label: string, text?: string) {
    if (!value) return gap(field, label, text)
    return (
      <span className="group inline-flex items-center">
        <span>{value}</span>
        <SuggestCorrectionButton collegeId={college.id} field={field} label={label} current={value} />
      </span>
    )
  }

  const campuses = college.campuses ?? []
  const mainCampus = campuses[0]
  const courseTotal = courses.data?.meta.total ?? courses.data?.items.length

  // ---- header ------------------------------------------------------------------------------
  const header = (
    <div className="flex min-w-0 flex-1 items-start gap-lg">
      <div className="flex h-24 w-24 shrink-0 items-center justify-center rounded-lg bg-primary/10">
        {college.logo_url ? (
          <img src={college.logo_url} alt="" className="h-16 w-16 rounded-md bg-surface object-contain p-xs" />
        ) : (
          <span className="text-h1 font-semibold text-primary">{(college.name ?? '?').charAt(0).toUpperCase()}</span>
        )}
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-xs">
        {college.active === false && (
          <div>
            <Badge color="error">Inactive</Badge>
          </div>
        )}
        <h2 className="text-h2 text-text-primary">{college.name}</h2>
        {mainCampus && (
          <p className="flex flex-wrap items-center gap-xs text-body text-text-secondary">
            <span>{[mainCampus.city, mainCampus.province_state].filter(Boolean).join(', ')}</span>
            {mainCampus.country && (
              <>
                {(mainCampus.city || mainCampus.province_state) && <span aria-hidden>|</span>}
                <CountryLabel name={mainCampus.country} />
              </>
            )}
          </p>
        )}
        {/* At-a-glance facts, read-only (user, 2026-09-10: "Institution type, Campuses, Courses..
            put it in header, no need to edit it"). The counts are derived from the catalogue. */}
        <div className="mt-xs flex flex-wrap items-center gap-md text-body-sm text-text-secondary">
          {college.institution_type && (
            <span className="inline-flex items-center gap-xs">
              <Landmark className="h-4 w-4 text-primary" aria-hidden />
              {INSTITUTION_TYPE_LABELS[college.institution_type] ?? college.institution_type}
            </span>
          )}
          <span className="inline-flex items-center gap-xs">
            <MapPin className="h-4 w-4 text-info" aria-hidden />
            {campuses.length} {campuses.length === 1 ? 'campus' : 'campuses'}
          </span>
          {courseTotal != null && (
            <span className="inline-flex items-center gap-xs">
              <BookOpen className="h-4 w-4 text-secondary" aria-hidden />
              {courseTotal} {courseTotal === 1 ? 'course' : 'courses'}
            </span>
          )}
        </div>
      </div>
      {/* Right side of the header (user, 2026-09-10), next to the close button. */}
      <div className="shrink-0 self-center">
        {college.website ? (
          <a
            href={college.website}
            target="_blank"
            rel="noreferrer"
            className="inline-flex h-10 items-center gap-xs rounded-full bg-primary px-md text-button font-medium text-text-on-primary shadow-card hover:opacity-90"
          >
            Visit website
            <ExternalLink className="h-4 w-4" aria-hidden />
          </a>
        ) : (
          <span className="inline-flex items-center gap-xs text-body-sm text-text-primary">
            Website: {gap('website', 'Website')}
          </span>
        )}
      </div>
    </div>
  )

  // ---- body --------------------------------------------------------------------------------
  const about = (
    <div className="text-body-sm text-text-secondary">
      {college.description ? college.description : gap('description', 'Description')}
    </div>
  )

  const keyDetails = (
    <Section title="Key Details">
      <div className="grid grid-cols-2 gap-x-lg gap-y-md md:grid-cols-3">
        <Fact icon={<Trophy className="h-5 w-5" />} color="warning" label="QS World Ranking">
          {show(college.qs_rank != null ? `#${college.qs_rank}` : null, 'qs_rank', 'QS rank')}
        </Fact>
        <Fact icon={<Medal className="h-5 w-5" />} color="secondary" label="THE Ranking">
          {show(college.the_rank != null ? `#${college.the_rank}` : null, 'the_rank', 'THE rank')}
        </Fact>
        <Fact icon={<Percent className="h-5 w-5" />} color="success" label="Acceptance rate">
          {show(college.acceptance_rate != null ? `${college.acceptance_rate}%` : null, 'acceptance_rate', 'Acceptance rate')}
        </Fact>
      </div>
    </Section>
  )

  const campusSection = (
    <Section title="Campuses">
      <div className="overflow-x-auto rounded-md border border-border bg-surface">
        <table className="w-full text-left text-body-sm">
          <thead className="bg-background text-caption text-text-secondary">
            <tr>
              <th className="px-md py-sm font-medium">City</th>
              <th className="px-md py-sm font-medium">State / Province</th>
              <th className="px-md py-sm font-medium">Country</th>
            </tr>
          </thead>
          <tbody>
            {campuses.length === 0 ? (
              <tr>
                <td colSpan={3} className="px-md py-sm">
                  {gap('campuses', 'Campus', 'No campuses provided')}
                </td>
              </tr>
            ) : (
              campuses.map((campus) => {
                const name = campus.city ?? 'Campus'
                return (
                  <tr key={campus.id} className="border-t border-border">
                    <td className="px-md py-sm text-text-primary">
                      <span className="inline-flex flex-wrap items-center gap-xs">
                        {show(campus.city, `campus.${campus.id}.city`, 'Campus city')}
                        {campus.active === false && <Badge color="error">Inactive</Badge>}
                      </span>
                    </td>
                    <td className="px-md py-sm text-text-primary">
                      {show(campus.province_state, `campus.${campus.id}.province_state`, `${name} state / province`)}
                    </td>
                    <td className="px-md py-sm text-text-primary">
                      {campus.country ? <CountryLabel name={campus.country} /> : gap(`campus.${campus.id}.country`, `${name} country`)}
                    </td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>
    </Section>
  )

  const courseSection = (
    <Section title={`Courses${courseTotal != null ? ` (${courseTotal})` : ''}`}>
      {courses.isLoading && <p className="text-body-sm text-text-secondary">Loading…</p>}
      {/* H10 fix (frontend review, 1 Sep 2026) — a failed fetch used to fall through to "No
          courses listed", indistinguishable from a college that genuinely has none yet. */}
      {courses.isError && (
        <div className="flex items-center justify-between gap-sm">
          <p className="text-body-sm text-error">Could not load courses.</p>
          <button type="button" onClick={() => courses.refetch()} className="text-body-sm text-primary hover:underline">
            Retry
          </button>
        </div>
      )}
      {!courses.isError && courses.data?.items.length === 0 && (
        <p className="text-body-sm text-text-secondary">No courses listed for this college yet.</p>
      )}
      {!courses.isError && (courses.data?.items.length ?? 0) > 0 && (
        <ul className="flex flex-col overflow-hidden rounded-md border border-border bg-surface">
          {courses.data?.items.map((c) => (
            <li key={c.id} className="flex items-center justify-between gap-md border-t border-border px-md py-sm first:border-t-0">
              <div className="min-w-0">
                <p className="truncate text-body-sm font-medium text-text-primary">{c.name}</p>
                {(c.field_of_study || c.duration) && (
                  <p className="truncate text-caption text-text-secondary">
                    {[c.field_of_study, c.duration].filter(Boolean).join(' · ')}
                  </p>
                )}
              </div>
              {c.level && (
                <Badge color="secondary" className="shrink-0 capitalize">
                  {c.level}
                </Badge>
              )}
            </li>
          ))}
        </ul>
      )}
    </Section>
  )

  return (
    <Modal onClose={onClose} title={college.name ?? 'College'} header={header} widthRem={56}>
      <div className="flex flex-col gap-md">
        {gaps.length > 0 && (
          <p className="rounded-md bg-info/10 px-md py-sm text-body-sm text-text-primary">
            {gaps.length} {gaps.length === 1 ? 'detail is' : 'details are'} missing for this college. Use{' '}
            <span className="font-medium text-primary">+ Add</span> next to any of them to suggest the value — a
            Platform Admin reviews it before students see it.
          </p>
        )}
        {about}
        {keyDetails}
        {campusSection}
        {courseSection}
      </div>
    </Modal>
  )
}
