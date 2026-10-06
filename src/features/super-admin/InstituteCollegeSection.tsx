import { useState } from 'react'
import { Button } from '@/components/Button'
import { Modal } from '@/components/Modal'
import { ServerSearchSelect } from '@/components/ServerSearchSelect'
import type { components } from '@/api/schema'
import { useCollegeDetail } from '@/queries/adminColleges'
import { useLinkCollege } from '@/queries/adminConsultancies'
import { collegeWithCoursesSource, type College } from '@/queries/pickerSources'

type Consultancy = components['schemas']['Consultancy']

/** "12 courses", "1 course", or what to say when the catalogue did not send a count. */
function courseCountLabel(count: number | null | undefined): string {
  if (count == null) return 'course count not available'
  return `${count} course${count === 1 ? '' : 's'}`
}

/**
 * The step between choosing a college and attaching it (review F-155). The link is permanent —
 * the server refuses a second attempt — and it used to go out on a single click of "Link college"
 * with whatever the picker held, so a near-namesake could be attached for good. The confirmation
 * names both sides and shows the college's course count, the quickest way to tell the real
 * college from an empty duplicate of it.
 */
function LinkCollegeConfirmModal({
  consultancyName,
  college,
  loading,
  error,
  onConfirm,
  onClose,
}: {
  consultancyName: string
  college: College
  loading: boolean
  error?: string
  onConfirm: () => void
  onClose: () => void
}) {
  const noCourses = college.course_count === 0
  return (
    <Modal
      onClose={onClose}
      title="Link this college?"
      widthRem={30}
      footer={
        <>
          {error && (
            <p role="alert" className="mr-auto self-center text-body-sm text-error">
              {error}
            </p>
          )}
          <Button variant="secondary" onClick={onClose} disabled={loading}>
            Cancel
          </Button>
          <Button loading={loading} onClick={onConfirm}>
            Link permanently
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-md">
        <p className="text-body-sm text-text-primary">
          <span className="font-medium">{consultancyName}</span> will be linked to:
        </p>
        <div className="rounded-md border border-border bg-background px-md py-sm">
          <p className="text-body font-medium text-text-primary">{college.name}</p>
          <p className="text-caption text-text-secondary">{courseCountLabel(college.course_count)}</p>
        </div>
        {noCourses && (
          <p className="rounded-md bg-warning-subtle px-md py-sm text-body-sm text-text-primary">
            This college has no courses yet. Check it is the right one and not a duplicate entry.
          </p>
        )}
        <p className="text-body-sm text-text-secondary">
          This cannot be changed later. The account&rsquo;s course catalogue will be fixed to this college, and the
          link cannot be moved to another college or removed.
        </p>
      </div>
    </Modal>
  )
}

/**
 * The institute's college, and the second half of D8's linking when it has none yet.
 *
 * Both directions are surfaced here because both really happen: an account created with its
 * college shows it as settled fact, and one created without shows the picker that attaches it.
 * The attach is WRITE-ONCE — the server refuses a second attempt 409 `college_already_linked`,
 * because moving an account between colleges would silently reassign every case, application and
 * commission entry on it — so once linked there is no control at all rather than one that fails.
 */
export function InstituteCollegeSection({ consultancy }: { consultancy: Consultancy }) {
  const linkCollege = useLinkCollege(consultancy.id!)
  const linkedCollege = useCollegeDetail(consultancy.college_id ?? undefined)
  // The chosen record itself, not just its id: the confirmation names it and shows its courses.
  const [college, setCollege] = useState<College | null>(null)
  const [confirming, setConfirming] = useState(false)

  function closeConfirm() {
    setConfirming(false)
    linkCollege.reset()
  }

  return (
    <div className="flex flex-col gap-sm p-md">
      <p className="text-body-sm font-medium text-text-primary">College</p>
      {consultancy.college_id ? (
        <>
          <p className="text-body-sm text-text-primary">{linkedCollege.data?.name ?? 'Loading…'}</p>
          <p className="text-caption text-text-secondary">
            This account&rsquo;s course catalogue is fixed to this college, and its partner colleges are itself. The
            link is set once and cannot be moved — reassigning an institute to another college would carry every case
            on it across.
          </p>
        </>
      ) : (
        <>
          <p className="text-caption text-text-secondary">
            Not linked yet. Until a college is attached this account sees <strong>no</strong> catalogue at all — the
            fail-closed reading of &ldquo;not linked&rdquo;. Attaching is permanent.
          </p>
          <div className="flex flex-wrap items-end gap-sm">
            <div className="min-w-[16rem] flex-1">
              {/* F-038: searched on the server — the attach is permanent, and the right college
                  was not reachable past the first 100. */}
              <ServerSearchSelect
                id="institute-link-college"
                label="College"
                source={collegeWithCoursesSource}
                value={college?.id ?? ''}
                selectedOption={college ? collegeWithCoursesSource.toOption(college) : null}
                onChange={(_id, row) => setCollege(row ?? null)}
                placeholder="Search the catalogue…"
              />
            </div>
            {/* Opens the confirmation; nothing is sent from here (review F-155). */}
            <Button disabled={!college} onClick={() => setConfirming(true)}>
              Link college
            </Button>
          </div>
        </>
      )}
      {confirming && college && (
        <LinkCollegeConfirmModal
          consultancyName={consultancy.name ?? 'This account'}
          college={college}
          loading={linkCollege.isPending}
          error={linkCollege.isError ? linkCollege.error.message : undefined}
          onClose={closeConfirm}
          onConfirm={() =>
            linkCollege.mutate(college.id, {
              onSuccess: () => {
                setConfirming(false)
                setCollege(null)
              },
            })
          }
        />
      )}
    </div>
  )
}
