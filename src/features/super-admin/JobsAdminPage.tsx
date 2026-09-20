import { useState, type FormEvent, type ReactNode } from 'react'
import { Pencil, X } from 'lucide-react'
import { AdminShell } from '@/features/auth/AdminShell'
import { SelectField } from '@/components/SelectField'
import { Button } from '@/components/Button'
import { Badge } from '@/components/Badge'
import { TextField } from '@/components/TextField'
import { FieldLabel } from '@/components/FieldLabel'
import { Toggle } from '@/components/Toggle'
import { ImageUploadField } from '@/components/ImageUploadField'
import { Table, type TableColumn } from '@/components/Table'
import { CompactSelect } from '@/components/CompactSelect'
import { CountrySelect } from '@/components/CountrySelect'
import { StateSelect } from '@/components/StateSelect'
import { Modal } from '@/components/Modal'
import { useAdminJobs, useCreateJob, useJobLocations, useUpdateJob } from '@/queries/jobsAdmin'
import { useCursorPagination } from '@/lib/pagination'
import { daysSince, formatDate } from '@/lib/time'
import { showToast } from '@/lib/toast'
import type { components } from '@/api/schema'

type JobListing = components['schemas']['JobListing']
type JobType = NonNullable<JobListing['job_type']>
type WorkMode = NonNullable<JobListing['work_mode']>
type JobStatus = NonNullable<JobListing['status']>

function postedCaption(postedAt?: string): string | null {
  if (!postedAt) return null
  // Floored, like every other elapsed-days figure in the console (assumptions audit M38) — this
  // one rounded, so a job posted 14 hours ago read "Posted 1 day ago".
  const days = daysSince(postedAt)
  if (days === 0) return 'Posted today'
  if (days === 1) return 'Posted 1 day ago'
  return `Posted ${days} days ago`
}

// User-requested (2026-08-18) — "Jobs module - I think we haven't fully implemented all the
// fields. Can you check!!" then "Can you fix Jobs module?" Confirmed: the backend/schema
// (JobListingInput, PATCH /jobs/{id}, the job_listings table, seed data) has always supported
// every field build reference 1.10 lists, but this form only ever collected title/company/
// location/apply_url, and there was no Edit action at all — every other field (category,
// job_type, description, salary_range, work_mode, experience_level, skills, active window)
// silently had no way to be set. Rewritten as a combined Add/Edit popup (editingJob prop, same
// pattern as WebinarFormModal) covering the full field set.
//
// Free-text Location replaced by country / state-province / city (product owner, 2026-09-20) —
// `location` is derived and read-only now, exactly like Course.duration, so there is nothing here
// to type it into. The place group sits directly under Work mode because work mode is what decides
// whether a country is required, and a rule reads as a rule only when the field it depends on is
// beside it rather than four rows away.
export function JobFormModal({ editingJob, onClose }: { editingJob?: JobListing; onClose: () => void }) {
  const isEditing = Boolean(editingJob)
  const createJob = useCreateJob()
  const updateJob = useUpdateJob(editingJob?.id ?? '')
  const [title, setTitle] = useState(editingJob?.title ?? '')
  const [company, setCompany] = useState(editingJob?.company ?? '')
  const [companyLogoUrl, setCompanyLogoUrl] = useState(editingJob?.company_logo_url ?? '')
  const [country, setCountry] = useState(editingJob?.country ?? '')
  const [provinceState, setProvinceState] = useState(editingJob?.province_state ?? '')
  const [city, setCity] = useState(editingJob?.city ?? '')
  const [category, setCategory] = useState(editingJob?.category ?? '')
  const [jobType, setJobType] = useState<JobType>(editingJob?.job_type ?? 'full_time')
  const [description, setDescription] = useState(editingJob?.description ?? '')
  const [applyUrl, setApplyUrl] = useState(editingJob?.apply_url ?? '')
  const [salaryRange, setSalaryRange] = useState(editingJob?.salary_range ?? '')
  const [workMode, setWorkMode] = useState<WorkMode>(editingJob?.work_mode ?? 'on_site')
  const [experienceLevel, setExperienceLevel] = useState(editingJob?.experience_level ?? '')
  const [skills, setSkills] = useState<string[]>(editingJob?.skills ?? [])
  const [skillDraft, setSkillDraft] = useState('')
  const [activeFrom, setActiveFrom] = useState(editingJob?.active_from ?? '')
  const [activeTo, setActiveTo] = useState(editingJob?.active_to ?? '')
  const [attempted, setAttempted] = useState(false)

  const mutation = isEditing ? updateJob : createJob
  const applyUrlError = !attempted
    ? undefined
    : !applyUrl.trim()
      ? 'Apply URL is required.'
      : !applyUrl.startsWith('https://')
        ? 'Must start with https://'
        : undefined
  // The server refuses a country-less non-remote job 422 (product owner, 2026-09-20). Checked here
  // too, and the Save is blocked on it, so the admin learns the rule while filling the field in
  // rather than after losing a round trip — the server's message is still surfaced in the footer
  // if a case this form doesn't know about ever comes back.
  const countryRequired = workMode !== 'remote'
  const countryError = attempted && countryRequired && !country ? 'Required unless the work mode is Remote.' : undefined
  const canSubmit = Boolean(
    title.trim() && company.trim() && applyUrl.trim() && applyUrl.startsWith('https://') && (!countryRequired || country),
  )
  const titleError = attempted && !title.trim() ? 'Title is required.' : undefined
  const companyError = attempted && !company.trim() ? 'Company is required.' : undefined

  // A province belongs to the country it was picked under: keeping it across a country change
  // would carry a value the new country's list has never heard of straight into the server's 422.
  function changeCountry(next: string) {
    setCountry(next)
    if (next !== country) setProvinceState('')
  }

  function addSkill() {
    const trimmed = skillDraft.trim()
    if (!trimmed || skills.includes(trimmed)) return
    setSkills((prev) => [...prev, trimmed])
    setSkillDraft('')
  }

  function removeSkill(skill: string) {
    setSkills((prev) => prev.filter((s) => s !== skill))
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!canSubmit) {
      setAttempted(true)
      return
    }
    const body = {
      title,
      company,
      company_logo_url: companyLogoUrl || null,
      // No `location` — it is derived server-side from these three and a `location` in a request
      // body is ignored, so sending one would only read as though this form still set it.
      country: country || null,
      province_state: country ? provinceState || null : null,
      city: city.trim() || null,
      category,
      job_type: jobType,
      description,
      apply_url: applyUrl,
      salary_range: salaryRange || null,
      work_mode: workMode,
      experience_level: experienceLevel || null,
      skills,
      active_from: activeFrom || null,
      active_to: activeTo || null,
    }
    if (isEditing) {
      updateJob.mutate(body, {
        onSuccess: () => {
          onClose()
          showToast(`${title} updated`)
        },
      })
    } else {
      createJob.mutate(body, {
        onSuccess: () => {
          onClose()
          showToast(`${title} posted`)
        },
      })
    }
  }

  return (
    <Modal
      onClose={onClose}
      title={isEditing ? 'Edit Listing' : 'Add Listing'}
      widthRem={34}
      footer={
        <>
          {mutation.isError && <p className="mr-auto self-center text-body-sm text-error">{mutation.error.message}</p>}
          <Button type="submit" form="job-form" loading={mutation.isPending}>
            {isEditing ? 'Save Changes' : 'Create Listing'}
          </Button>
        </>
      }
    >
      {/* `noValidate` (2026-09-20) — the console's convention since product review L3: inline
          errors under the field, never the browser's own bubbles. This form was still the odd one
          out, so every custom message it already carried ("Title is required.", and now the
          country rule) was unreachable — the native `required` bubble fired first and said
          "Please select an item in the list", which cannot express "unless the work mode is
          Remote". The save is still blocked; it is blocked by this form, saying why. */}
      <form id="job-form" onSubmit={handleSubmit} noValidate className="flex flex-col gap-md">
        <TextField label="Title" required value={title} onChange={(e) => setTitle(e.target.value)} error={titleError} />
        <div className="grid grid-cols-2 gap-sm">
          <TextField
            label="Company"
            required
            value={company}
            onChange={(e) => setCompany(e.target.value)}
            error={companyError}
          />
          <TextField label="Category" value={category} onChange={(e) => setCategory(e.target.value)} />
        </div>
        {/* Employer logo (added 2026-08-18). Sentpo Mobile shows this beside the listing; without
            it every job card falls back to a generated initial, which is what the student sees
            today for every listing created before this field existed. */}
        <ImageUploadField
          label="Company logo"
          value={companyLogoUrl}
          onChange={setCompanyLogoUrl}
          hint="Square works best — shown at 40×40 in the app. Ideal size 200×200px."
        />
        <div className="grid grid-cols-2 items-end gap-sm">
          <SelectField
            label="Job type"
            required
            id="job-type"
            value={jobType}
            onChange={(e) => setJobType(e.target.value as JobType)}
          >
            <option value="full_time">Full-time</option>
            <option value="internship">Internship</option>
            <option value="part_time">Part-time</option>
          </SelectField>
          <SelectField
            label="Work mode"
            required
            id="work-mode"
            value={workMode}
            onChange={(e) => setWorkMode(e.target.value as WorkMode)}
          >
            <option value="remote">Remote</option>
            <option value="hybrid">Hybrid</option>
            <option value="on_site">On-site</option>
          </SelectField>
        </div>
        {/* Where the job is (product owner, 2026-09-20). The same CountrySelect / StateSelect pair
            the Institutions page uses (assumptions audit H11) — the state picker follows the chosen
            country and only ever offers values the server will accept, so the console cannot put
            forward a spelling the API then refuses 422. City stays free text, deliberately: a
            managed world city list is a rabbit hole, and a city is one rung below what the filters
            need. */}
        <div className="grid grid-cols-2 items-start gap-sm">
          <CountrySelect
            label="Country"
            required={countryRequired}
            value={country}
            onChange={changeCountry}
            error={countryError}
          />
          <StateSelect label="State / province" country={country} value={provinceState} onChange={setProvinceState} />
        </div>
        <TextField label="City" value={city} onChange={(e) => setCity(e.target.value)} />
        <p className="-mt-sm text-caption text-text-secondary">
          {countryRequired
            ? 'A country is required unless the work mode is Remote. Students see these as one line — “Bengaluru, Karnataka, India”.'
            : 'A remote job can skip the country, or name one if you only want applicants from there.'}
        </p>
        <div className="flex flex-col gap-xs">
          <FieldLabel htmlFor="job-description">Description</FieldLabel>
          <textarea
            id="job-description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            className="rounded-md border border-border bg-surface p-sm text-body text-text-primary"
          />
        </div>
        <div className="flex flex-col gap-xs">
          <TextField
            label="Apply URL"
            required
            value={applyUrl}
            onChange={(e) => setApplyUrl(e.target.value)}
            error={applyUrlError}
          />
          <p className="text-caption text-text-secondary">Must start with https://</p>
        </div>
        <div className="grid grid-cols-2 items-end gap-sm">
          <TextField label="Salary range" value={salaryRange ?? ''} onChange={(e) => setSalaryRange(e.target.value)} />
          <TextField
            label="Experience level"
            value={experienceLevel ?? ''}
            onChange={(e) => setExperienceLevel(e.target.value)}
          />
        </div>

        <div className="flex flex-col gap-xs">
          <p className="text-body-sm font-medium text-text-primary">Skills</p>
          {skills.length > 0 && (
            <div className="flex flex-wrap gap-xs">
              {skills.map((skill) => (
                <span
                  key={skill}
                  className="flex items-center gap-xs rounded-full bg-background px-sm py-xs text-caption text-text-primary"
                >
                  {skill}
                  <button
                    type="button"
                    onClick={() => removeSkill(skill)}
                    aria-label={`Remove ${skill}`}
                    className="text-text-secondary hover:text-error"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </span>
              ))}
            </div>
          )}
          <div className="flex items-end gap-sm">
            <TextField
              label="Skill"
              value={skillDraft}
              onChange={(e) => setSkillDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  addSkill()
                }
              }}
            />
            <Button type="button" variant="secondary" onClick={addSkill} disabled={!skillDraft.trim()}>
              Add Skill
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-sm">
          <TextField
            label="Active from"
            type="date"
            value={activeFrom ?? ''}
            onChange={(e) => setActiveFrom(e.target.value)}
          />
          <TextField
            label="Active to"
            type="date"
            value={activeTo ?? ''}
            onChange={(e) => setActiveTo(e.target.value)}
          />
        </div>
        <p className="-mt-sm text-caption text-text-secondary">
          Runs until the end of this day (India time). Leave both blank to run indefinitely.
        </p>
        <p className="text-caption text-text-secondary">
          Students with a matching job alert are notified when it goes live.
        </p>
      </form>
    </Modal>
  )
}

const jobTypeLabels: Record<JobType, string> = {
  full_time: 'Full-time',
  internship: 'Internship',
  part_time: 'Part-time',
}

const workModeLabels: Record<WorkMode, string> = {
  remote: 'Remote',
  hybrid: 'Hybrid',
  on_site: 'On-site',
}

// Computed server-side from active/active_from/active_to (2026-09-11) — an expired listing used
// to still read "Active" here because the badge was driven by the admin's own `active` flag
// rather than whether students could actually see it.
const statusBadge: Record<JobStatus, { label: string; color: 'success' | 'info' | 'secondary' }> = {
  live: { label: 'Live', color: 'success' },
  scheduled: { label: 'Scheduled', color: 'info' },
  expired: { label: 'Expired', color: 'secondary' },
  off: { label: 'Off', color: 'secondary' },
}

// Row-level component so useUpdateJob(job.id) can be called at its own render top level — Table's
// `render: (row) => ...` runs as a callback, not a component body.
function JobStatusCell({ job }: { job: JobListing }) {
  const updateJob = useUpdateJob(job.id!)
  const [error, setError] = useState<string | null>(null)
  const status = job.status ? statusBadge[job.status] : null

  return (
    <div className="flex flex-col gap-xs">
      <div className="flex items-center gap-sm">
        {status && <Badge color={status.color}>{status.label}</Badge>}
        <Toggle
          size="sm"
          checked={Boolean(job.active)}
          onChange={(checked) => {
            setError(null)
            updateJob.mutate({ active: checked }, { onError: (e) => setError(e.message) })
          }}
          label={`${job.title} active`}
        />
      </div>
      {error && <span className="text-caption text-error">{error}</span>}
    </div>
  )
}

function DetailRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-md">
      <dt className="shrink-0 text-text-secondary">{label}</dt>
      <dd className="min-w-0 text-right text-text-primary">{value}</dd>
    </div>
  )
}

// User-requested (2026-08-18) — "On Job title click can you show all details?" Same
// click-title-for-read-only-details / pencil-icon-for-edit split Webinars/Physical Meetings
// already use (EventDetailsModal), rather than folding view+edit into one popup the way Quiz
// does — Jobs has real read-only-worthy content (skills, description, click stats) distinct from
// the editable form fields, so a dedicated read-only view earns its keep here.
function JobDetailsModal({ job, onClose }: { job: JobListing; onClose: () => void }) {
  const status = job.status ? statusBadge[job.status] : null
  return (
    <Modal onClose={onClose} title={job.title ?? ''} widthRem={30} dismissible>
      <div className="flex flex-col gap-md">
        <div className="flex flex-wrap items-center gap-xs">
          {status && <Badge color={status.color}>{status.label}</Badge>}
          {job.job_type && <Badge color="info">{jobTypeLabels[job.job_type]}</Badge>}
          {job.work_mode && <Badge color="secondary">{workModeLabels[job.work_mode]}</Badge>}
          {job.apply_url_healthy === false && <Badge color="error">Broken link</Badge>}
        </div>
        {/* A place-less remote listing serves an empty `location`, so this reads as the company
            alone — which is correct here, not broken: the Remote badge is on the line directly
            above, and repeating "Remote" one line under it would put the same fact in two places,
            the exact habit this change exists to end. (The LIST is a different matter: a column
            headed Location has to answer for itself, so it says Remote there.) */}
        <p className="text-body-sm text-text-secondary">
          {job.company}
          {job.location ? ` · ${job.location}` : ''}
        </p>
        {job.description && <p className="text-body-sm text-text-secondary">{job.description}</p>}

        <dl className="flex flex-col gap-xs text-body-sm">
          <DetailRow label="Category" value={job.category || '—'} />
          <DetailRow label="Salary range" value={job.salary_range || '—'} />
          <DetailRow label="Experience level" value={job.experience_level || '—'} />
          <DetailRow
            label="Apply URL"
            value={
              job.apply_url ? (
                <a href={job.apply_url} target="_blank" rel="noreferrer" className="text-primary hover:underline">
                  {job.apply_url}
                </a>
              ) : (
                '—'
              )
            }
          />
          <DetailRow
            label="Active window"
            value={
              job.active_from || job.active_to
                ? `${job.active_from ? formatDate(job.active_from) : '—'} – ${job.active_to ? formatDate(job.active_to) : '—'}`
                : 'Runs indefinitely'
            }
          />
          <DetailRow label="Posted" value={postedCaption(job.posted_at) ?? '—'} />
          <DetailRow label="Clicks" value={`${job.total_clicks ?? 0} total, ${job.unique_clicks ?? 0} unique`} />
        </dl>

        {job.skills && job.skills.length > 0 && (
          <div className="flex flex-col gap-xs border-t border-border pt-sm">
            <span className="text-body-sm text-text-secondary">Skills</span>
            <div className="flex flex-wrap gap-xs">
              {job.skills.map((skill) => (
                <span key={skill} className="rounded-full bg-background px-sm py-xs text-caption text-text-primary">
                  {skill}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
    </Modal>
  )
}

// The placeholder carries the state of a dependent picker, the way StateSelect's does: "pick a
// country first" is the instruction, and a country whose live listings name no state at all gets
// told so rather than showing an empty dropdown that looks like a failed load.
function provincePlaceholder(country: string, options: ReturnType<typeof useJobLocations>): string {
  if (!country) return 'Pick a country first'
  if (options.isLoading) return 'Loading…'
  if (options.isError) return 'Couldn’t load the states'
  if ((options.data ?? []).length === 0) return 'No states with live jobs'
  return 'Any state / province'
}

export function JobsAdminPage() {
  const [showAdd, setShowAdd] = useState(false)
  const [editing, setEditing] = useState<JobListing | null>(null)
  const [viewing, setViewing] = useState<JobListing | null>(null)
  const [sort, setSort] = useState<{ field: string; direction: 'asc' | 'desc' } | null>(null)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<'' | JobStatus>('')
  const [typeFilter, setTypeFilter] = useState<'' | JobType>('')
  const [workModeFilter, setWorkModeFilter] = useState<'' | WorkMode>('')
  const [countryFilter, setCountryFilter] = useState('')
  const [provinceFilter, setProvinceFilter] = useState('')
  const paging = useCursorPagination()

  function resetPaging() {
    paging.reset()
  }

  // Both rungs of the SAME endpoint: no country asks which countries have live listings, a country
  // asks which of its states do (product owner, 2026-09-20). Never a distinct-values scan of the
  // rows on screen — that is what a free-text location forced, and it could only ever see the
  // twenty rows of the current page.
  const countryOptions = useJobLocations()
  const provinceOptions = useJobLocations(countryFilter || undefined)

  const jobs = useAdminJobs({
    search: search || undefined,
    status: statusFilter || undefined,
    jobType: typeFilter || undefined,
    workMode: workModeFilter || undefined,
    country: countryFilter || undefined,
    provinceState: provinceFilter || undefined,
    sort: sort ? (sort.direction === 'desc' ? `-${sort.field}` : sort.field) : undefined,
    cursor: paging.cursor,
    limit: 20,
  })

  const rows = jobs.data?.items ?? []

  const columns: TableColumn<JobListing>[] = [
    {
      key: 'title',
      header: 'Listing',
      render: (j) => (
        <div>
          <div className="flex items-center gap-sm">
            <button
              type="button"
              onClick={() => setViewing(j)}
              className="text-left font-medium text-text-primary hover:text-primary hover:underline"
            >
              {j.title}
            </button>
            {/* Straight off the row (product owner, 2026-09-20) — `featured` is sent on EVERY
                listing, true only while the job is in App Config's picked set AND inside its own
                active window, so a picked job that has expired stops reading as featured here
                without anyone editing the setting. */}
            {j.featured && <Badge color="primary">Featured</Badge>}
            {j.apply_url_healthy === false && <Badge color="error">Broken link</Badge>}
          </div>
          <p className="text-caption text-text-secondary">{j.company}</p>
        </div>
      ),
    },
    {
      key: 'job_type',
      header: 'Type',
      render: (j) => (j.job_type ? <Badge color="info">{jobTypeLabels[j.job_type]}</Badge> : '—'),
    },
    {
      key: 'work_mode',
      header: 'Work Mode',
      render: (j) => (j.work_mode ? <Badge color="secondary">{workModeLabels[j.work_mode]}</Badge> : '—'),
    },
    {
      key: 'location',
      header: 'Location',
      hideBelow: 'md',
      // Derived server-side from country/province/city, so it is just displayed (2026-09-20).
      // A remote listing is allowed to have no place at all and serves an empty string for it —
      // "Location not set" would read as a half-filled row that somebody ought to go and fix, when
      // in fact the listing is complete and the honest answer to "where" is "nowhere, it's remote".
      render: (j) =>
        j.location || (
          <span className="text-text-secondary">{j.work_mode === 'remote' ? 'Remote' : 'Location not set'}</span>
        ),
    },
    {
      key: 'posted_at',
      header: 'Posted',
      sortable: true,
      hideBelow: 'sm',
      render: (j) => postedCaption(j.posted_at) ?? '—',
    },
    { key: 'total_clicks', header: 'Clicks', sortable: true, align: 'right', render: (j) => j.total_clicks ?? 0 },
    { key: 'status', header: 'Status', render: (j) => <JobStatusCell job={j} /> },
    {
      key: 'actions',
      header: '',
      align: 'right',
      render: (j) => (
        <div className="flex justify-end">
          <button
            type="button"
            onClick={() => setEditing(j)}
            aria-label={`Edit ${j.title}`}
            title="Edit"
            className="flex h-9 w-9 items-center justify-center rounded-md text-text-secondary hover:bg-background hover:text-text-primary"
          >
            <Pencil className="h-4 w-4" />
          </button>
        </div>
      ),
    },
  ]

  return (
    <AdminShell>
      <div className="flex flex-col gap-lg">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-h1 text-text-primary">Jobs</h1>
            <p className="text-body-sm text-text-secondary">
              Job listings shown to students, with periodic link health checks.
            </p>
          </div>
          <Button onClick={() => setShowAdd(true)}>Add Listing</Button>
        </div>

        {showAdd && <JobFormModal onClose={() => setShowAdd(false)} />}
        {editing && <JobFormModal editingJob={editing} onClose={() => setEditing(null)} />}
        {viewing && <JobDetailsModal job={viewing} onClose={() => setViewing(null)} />}

        <Table
          columns={columns}
          rows={rows}
          rowKey={(j) => j.id!}
          loading={jobs.isLoading}
          error={jobs.isError ? 'Could not load job listings.' : undefined}
          emptyMessage={
            search || statusFilter || typeFilter || workModeFilter || countryFilter || provinceFilter
              ? 'No listings match these filters.'
              : "No job listings yet. Add one with Add Listing above; students see it in the app's Jobs tab."
          }
          sort={sort}
          onSortChange={(field, direction) => {
            setSort({ field, direction })
            resetPaging()
          }}
          search={{
            value: search,
            onChange: (value) => {
              setSearch(value)
              resetPaging()
            },
            placeholder: 'Search title, company, location or skills…',
          }}
          filters={
            <>
              <CompactSelect
                value={statusFilter}
                onChange={(e) => {
                  setStatusFilter(e.target.value as '' | JobStatus)
                  resetPaging()
                }}
                label="Status"
              >
                <option value="">Any status</option>
                <option value="live">Live</option>
                <option value="scheduled">Scheduled</option>
                <option value="expired">Expired</option>
                <option value="off">Off</option>
              </CompactSelect>
              <CompactSelect
                value={typeFilter}
                onChange={(e) => {
                  setTypeFilter(e.target.value as '' | JobType)
                  resetPaging()
                }}
                label="Type"
              >
                <option value="">Any type</option>
                <option value="full_time">Full-time</option>
                <option value="internship">Internship</option>
                <option value="part_time">Part-time</option>
              </CompactSelect>
              <CompactSelect
                value={workModeFilter}
                onChange={(e) => {
                  setWorkModeFilter(e.target.value as '' | WorkMode)
                  resetPaging()
                }}
                label="Work mode"
              >
                <option value="">Any work mode</option>
                <option value="remote">Remote</option>
                <option value="hybrid">Hybrid</option>
                <option value="on_site">On-site</option>
              </CompactSelect>
              {/* Country then state / province, both sourced from GET /jobs/locations, so only
                  places that actually HAVE live listings are ever offered — with four countries in
                  the data there are four chips, not two hundred. The counts come with them: a
                  filter that says what it will return is one nobody has to try first. */}
              <CompactSelect
                value={countryFilter}
                onChange={(e) => {
                  setCountryFilter(e.target.value)
                  // The provinces on offer belong to the old country; keeping one would filter on a
                  // state the newly chosen country does not have and return nothing.
                  setProvinceFilter('')
                  resetPaging()
                }}
                label="Country"
              >
                <option value="">{countryOptions.isError ? 'Countries unavailable' : 'Any country'}</option>
                {(countryOptions.data ?? []).map((place) => (
                  <option key={place.name} value={place.name}>
                    {place.name} ({place.job_count})
                  </option>
                ))}
              </CompactSelect>
              {/* Disabled until a country is chosen, rather than hidden: the same "Pick a country
                  first" wording StateSelect already uses everywhere else in the console, so the
                  dependency is stated instead of being something you discover. A control that
                  appears and disappears also reflows the whole filter row under the admin's
                  cursor, which the console does nowhere else. */}
              <CompactSelect
                value={provinceFilter}
                disabled={!countryFilter}
                onChange={(e) => {
                  setProvinceFilter(e.target.value)
                  resetPaging()
                }}
                label="State / province"
              >
                <option value="">{provincePlaceholder(countryFilter, provinceOptions)}</option>
                {/* Guarded on `countryFilter`, not just on the data: with no country the endpoint
                    answers the COUNTRY list (it is one endpoint at two depths), and rendering that
                    here would stock the province picker with countries. */}
                {(countryFilter ? (provinceOptions.data ?? []) : []).map((place) => (
                  <option key={place.name} value={place.name}>
                    {place.name} ({place.job_count})
                  </option>
                ))}
              </CompactSelect>
            </>
          }
          pagination={{
            hasNext: Boolean(jobs.data?.meta?.next_cursor),
            hasPrevious: paging.hasPrevious,
            onNext: () => jobs.data?.meta?.next_cursor && paging.next(jobs.data.meta.next_cursor),
            onPrevious: paging.previous,
            total: jobs.data?.meta?.total,
          }}
        />
      </div>
    </AdminShell>
  )
}
