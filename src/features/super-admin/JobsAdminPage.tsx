import { useMemo, useState, type FormEvent, type ReactNode } from 'react'
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
import { Modal } from '@/components/Modal'
import { useAdminJobs, useCreateJob, useUpdateJob } from '@/queries/jobsAdmin'
import { formatDate } from '@/lib/time'
import type { components } from '@/api/schema'

type JobListing = components['schemas']['JobListing']
type JobType = NonNullable<JobListing['job_type']>
type WorkMode = NonNullable<JobListing['work_mode']>

function postedCaption(postedAt?: string): string | null {
  if (!postedAt) return null
  const days = Math.max(0, Math.round((Date.now() - new Date(postedAt).getTime()) / 86400000))
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
function JobFormModal({ editingJob, onClose }: { editingJob?: JobListing; onClose: () => void }) {
  const isEditing = Boolean(editingJob)
  const createJob = useCreateJob()
  const updateJob = useUpdateJob(editingJob?.id ?? '')
  const [title, setTitle] = useState(editingJob?.title ?? '')
  const [company, setCompany] = useState(editingJob?.company ?? '')
  const [companyLogoUrl, setCompanyLogoUrl] = useState(editingJob?.company_logo_url ?? '')
  const [location, setLocation] = useState(editingJob?.location ?? '')
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

  const mutation = isEditing ? updateJob : createJob

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
    if (!title || !company || !applyUrl) return
    const body = {
      title,
      company,
      company_logo_url: companyLogoUrl || null,
      location,
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
      updateJob.mutate(body, { onSuccess: () => onClose() })
    } else {
      createJob.mutate(body, { onSuccess: () => onClose() })
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
          <Button type="submit" form="job-form" loading={mutation.isPending} disabled={!title || !company || !applyUrl}>
            {isEditing ? 'Save Changes' : 'Create Listing'}
          </Button>
        </>
      }
    >
      <form id="job-form" onSubmit={handleSubmit} className="flex flex-col gap-md">
        <TextField label="Title" required value={title} onChange={(e) => setTitle(e.target.value)} />
        <div className="grid grid-cols-2 gap-sm">
          <TextField label="Company" required value={company} onChange={(e) => setCompany(e.target.value)} />
          <TextField label="Location" value={location} onChange={(e) => setLocation(e.target.value)} />
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
          <TextField label="Category" value={category} onChange={(e) => setCategory(e.target.value)} />
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
        </div>
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
        <TextField label="Apply URL" required value={applyUrl} onChange={(e) => setApplyUrl(e.target.value)} />
        <div className="grid grid-cols-2 items-end gap-sm">
          <TextField label="Salary range" value={salaryRange ?? ''} onChange={(e) => setSalaryRange(e.target.value)} />
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
        <TextField
          label="Experience level"
          value={experienceLevel ?? ''}
          onChange={(e) => setExperienceLevel(e.target.value)}
        />

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
          The listing hides from students automatically once "Active to" passes. Leave both blank to run indefinitely.
        </p>
      </form>
    </Modal>
  )
}

// Row-level component so useUpdateJob(job.id) can be called at its own render top level — Table's
// `render: (row) => ...` runs as a callback, not a component body.
function JobToggle({ job }: { job: JobListing }) {
  const updateJob = useUpdateJob(job.id!)

  return (
    <div>
      <Toggle
        checked={Boolean(job.active)}
        onChange={(checked) => updateJob.mutate({ active: checked })}
        label={`${job.title} active`}
      />
    </div>
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
  return (
    <Modal onClose={onClose} title={job.title ?? ''} widthRem={30}>
      <div className="flex flex-col gap-md">
        <div className="flex flex-wrap items-center gap-xs">
          <Badge color={job.active ? 'success' : 'secondary'}>{job.active ? 'Active' : 'Inactive'}</Badge>
          {job.job_type && <Badge color="info">{jobTypeLabels[job.job_type]}</Badge>}
          {job.work_mode && <Badge color="secondary">{workModeLabels[job.work_mode]}</Badge>}
          {job.apply_url_healthy === false && <Badge color="error">Broken link</Badge>}
        </div>
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

export function JobsAdminPage() {
  const jobs = useAdminJobs()
  const [showAdd, setShowAdd] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [viewingId, setViewingId] = useState<string | null>(null)
  const [sort, setSort] = useState<{ field: string; direction: 'asc' | 'desc' } | null>(null)
  const [search, setSearch] = useState('')

  const rows = useMemo(() => {
    let items = jobs.data?.items ?? []
    if (search) {
      const q = search.toLowerCase()
      items = items.filter((j) => j.title?.toLowerCase().includes(q) || j.company?.toLowerCase().includes(q))
    }
    if (sort) {
      const dir = sort.direction === 'desc' ? -1 : 1
      items = [...items].sort((a, b) => {
        const av =
          sort.field === 'clicks'
            ? (a.total_clicks ?? 0)
            : sort.field === 'company'
              ? (a.company ?? '').toLowerCase()
              : (a.title ?? '').toLowerCase()
        const bv =
          sort.field === 'clicks'
            ? (b.total_clicks ?? 0)
            : sort.field === 'company'
              ? (b.company ?? '').toLowerCase()
              : (b.title ?? '').toLowerCase()
        return av < bv ? -1 * dir : av > bv ? 1 * dir : 0
      })
    }
    return items
  }, [jobs.data, search, sort])

  const editingJob = editingId ? rows.find((j) => j.id === editingId) : undefined
  const viewingJob = viewingId ? rows.find((j) => j.id === viewingId) : undefined

  const columns: TableColumn<JobListing>[] = [
    {
      key: 'title',
      header: 'Listing',
      sortable: true,
      render: (j) => (
        <div>
          <div className="flex items-center gap-sm">
            <button
              type="button"
              onClick={() => setViewingId(j.id!)}
              className="text-left font-medium text-text-primary hover:text-primary hover:underline"
            >
              {j.title}
            </button>
            {j.apply_url_healthy === false && <Badge color="error">Broken link</Badge>}
          </div>
          {postedCaption(j.posted_at) && (
            <p className="text-caption text-text-secondary">{postedCaption(j.posted_at)}</p>
          )}
        </div>
      ),
    },
    { key: 'company', header: 'Company', sortable: true, render: (j) => j.company },
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
    { key: 'location', header: 'Location', render: (j) => j.location || 'Location not set' },
    { key: 'clicks', header: 'Clicks', sortable: true, align: 'right', render: (j) => j.total_clicks ?? 0 },
    { key: 'active', header: 'Status', render: (j) => <JobToggle job={j} /> },
    {
      key: 'actions',
      header: '',
      align: 'right',
      render: (j) => (
        <div className="flex justify-end">
          <button
            type="button"
            onClick={() => setEditingId(j.id!)}
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
        {editingJob && <JobFormModal editingJob={editingJob} onClose={() => setEditingId(null)} />}
        {viewingJob && <JobDetailsModal job={viewingJob} onClose={() => setViewingId(null)} />}

        <Table
          columns={columns}
          rows={rows}
          rowKey={(j) => j.id!}
          loading={jobs.isLoading}
          error={jobs.isError ? 'Could not load job listings.' : undefined}
          emptyMessage={
            search
              ? 'No listings match your search.'
              : "No job listings yet. Add one with Add Listing above; students see it in the app's Jobs tab."
          }
          sort={sort}
          onSortChange={(field, direction) => setSort({ field, direction })}
          search={{ value: search, onChange: setSearch, placeholder: 'Search title or company…' }}
        />
      </div>
    </AdminShell>
  )
}
