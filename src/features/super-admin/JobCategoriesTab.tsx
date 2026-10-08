import { SettingsUsedIn } from './SettingsUsedIn'
import { useMemo, useState, type FormEvent } from 'react'
import { Archive, ArchiveRestore, GitMerge, Pencil } from 'lucide-react'
import { Badge } from '@/components/Badge'
import { Button } from '@/components/Button'
import { Modal } from '@/components/Modal'
import { SearchSelect } from '@/components/SearchSelect'
import { Table, type TableColumn } from '@/components/Table'
import { TextField } from '@/components/TextField'
import {
  useCreateJobCategory,
  useJobCategories,
  useMergeJobCategory,
  useUpdateJobCategory,
} from '@/queries/jobCategories'
import { ApiError } from '@/api/errors'
import { showToast } from '@/lib/toast'
import type { components } from '@/api/schema'

type JobCategory = components['schemas']['JobCategory']

function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? '' : 's'}`
}

function CategoryFormModal({ category, onClose }: { category?: JobCategory; onClose: () => void }) {
  const isEditing = Boolean(category)
  const create = useCreateJobCategory()
  const update = useUpdateJobCategory()
  const mutation = isEditing ? update : create
  const [name, setName] = useState(category?.name ?? '')
  const renaming = isEditing && name.trim() !== category!.name
  // A name another category already has (409 `already_exists`) is about the Name field, so the
  // server's sentence sits beside it; anything else stays in the footer.
  const nameTaken = mutation.error instanceof ApiError && mutation.error.code === 'already_exists'

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!name.trim()) return
    if (category) {
      update.mutate(
        { id: category.id, name: name.trim() },
        {
          onSuccess: () => {
            showToast(`${name.trim()} updated`)
            onClose()
          },
        },
      )
    } else {
      create.mutate(
        { name: name.trim() },
        {
          onSuccess: () => {
            showToast(`${name.trim()} added`)
            onClose()
          },
        },
      )
    }
  }

  return (
    <Modal
      onClose={onClose}
      title={isEditing ? 'Edit Job Category' : 'Add Job Category'}
      widthRem={30}
      footer={
        <>
          {mutation.isError && !nameTaken && (
            <p className="mr-auto self-center text-body-sm text-error">{mutation.error.message}</p>
          )}
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="job-category-form" loading={mutation.isPending} disabled={!name.trim()}>
            {isEditing ? 'Save Changes' : 'Add Category'}
          </Button>
        </>
      }
    >
      <form id="job-category-form" onSubmit={handleSubmit} className="flex flex-col gap-md">
        <TextField
          label="Name"
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          error={nameTaken ? mutation.error?.message : undefined}
        />
        {renaming && category!.job_count > 0 && (
          <p className="rounded-md bg-warning/10 p-sm text-caption text-text-secondary">
            The new name is applied to {plural(category!.job_count, 'job')} filed under this category.
          </p>
        )}
      </form>
    </Modal>
  )
}

function MergeCategoryModal({
  category,
  categories,
  onClose,
}: {
  category: JobCategory
  categories: JobCategory[]
  onClose: () => void
}) {
  const merge = useMergeJobCategory()
  const [intoId, setIntoId] = useState('')
  const target = categories.find((c) => c.id === intoId)
  const options = categories.filter((c) => c.id !== category.id && c.active).map((c) => ({ id: c.id, label: c.name }))

  return (
    <Modal
      onClose={onClose}
      title={`Merge ${category.name}`}
      widthRem={30}
      footer={
        <>
          {merge.isError && <p className="mr-auto self-center text-body-sm text-error">{merge.error.message}</p>}
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            loading={merge.isPending}
            disabled={!intoId}
            onClick={() =>
              merge.mutate(
                { id: category.id, intoId },
                {
                  onSuccess: () => {
                    showToast(`${category.name} merged into ${target?.name ?? 'the selected category'}`)
                    onClose()
                  },
                },
              )
            }
          >
            Merge
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-md">
        <p className="text-body-sm text-text-secondary">
          For a duplicate — say &ldquo;IT&rdquo; beside &ldquo;Technology&rdquo;. Choose the category to keep.
        </p>
        <SearchSelect
          id={`merge-into-${category.id}`}
          label="Merge into"
          required
          options={options}
          value={intoId}
          onChange={setIntoId}
          placeholder="Search categories…"
        />
        {target && (
          <ul className="flex list-disc flex-col gap-xs pl-lg text-body-sm text-text-secondary">
            <li>
              {plural(category.job_count, 'job')} and the job alerts that name this category move to{' '}
              <span className="font-medium text-text-primary">{target.name}</span>.
            </li>
            <li>{category.name} is removed from the list. This can&rsquo;t be undone.</li>
          </ul>
        )}
      </div>
    </Modal>
  )
}

function CategoryRowActions({
  category,
  onEdit,
  onMerge,
}: {
  category: JobCategory
  onEdit: () => void
  onMerge: () => void
}) {
  const update = useUpdateJobCategory()
  const [confirming, setConfirming] = useState(false)
  const retired = !category.active
  const used = category.job_count > 0
  // Retiring a category that listings are still filed under is refused (409 `still_referenced`,
  // `details.jobs` is how many). The way forward is a merge, so the refusal offers it.
  const refusal = update.error instanceof ApiError && update.error.code === 'still_referenced' ? update.error : null
  const jobsUsing = typeof refusal?.details?.jobs === 'number' ? refusal.details.jobs : null

  function closeConfirm() {
    setConfirming(false)
    update.reset()
  }

  return (
    <div className="flex items-center justify-end gap-xs">
      {retired && <Badge color="secondary">Retired</Badge>}
      <button
        type="button"
        onClick={onEdit}
        aria-label={`Edit ${category.name}`}
        title="Edit"
        className="flex h-9 w-9 items-center justify-center rounded-md text-text-secondary hover:bg-background hover:text-text-primary"
      >
        <Pencil className="h-4 w-4" />
      </button>
      <button
        type="button"
        onClick={onMerge}
        aria-label={`Merge ${category.name} into another category`}
        title="Merge into another category"
        className="flex h-9 w-9 items-center justify-center rounded-md text-text-secondary hover:bg-background hover:text-text-primary"
      >
        <GitMerge className="h-4 w-4" />
      </button>
      <button
        type="button"
        onClick={() => (retired ? update.mutate({ id: category.id, active: true }) : setConfirming(true))}
        disabled={update.isPending}
        aria-label={retired ? `Restore ${category.name}` : `Retire ${category.name}`}
        title={retired ? 'Restore' : used ? 'In use — merge it instead' : 'Retire'}
        className="flex h-9 w-9 items-center justify-center rounded-md text-text-secondary hover:bg-background hover:text-text-primary disabled:opacity-40"
      >
        {retired ? <ArchiveRestore className="h-4 w-4" /> : <Archive className="h-4 w-4" />}
      </button>
      {confirming && (
        <Modal
          onClose={closeConfirm}
          title="Retire job category"
          widthRem={26}
          footer={
            <>
              {update.isError && !refusal && (
                <p className="mr-auto self-center text-body-sm text-error">{update.error.message}</p>
              )}
              <Button variant="secondary" onClick={closeConfirm}>
                Cancel
              </Button>
              {refusal ? (
                <Button
                  onClick={() => {
                    closeConfirm()
                    onMerge()
                  }}
                >
                  Merge
                </Button>
              ) : (
                <Button
                  variant="destructive"
                  loading={update.isPending}
                  onClick={() => update.mutate({ id: category.id, active: false }, { onSuccess: closeConfirm })}
                >
                  Retire
                </Button>
              )}
            </>
          }
        >
          {refusal ? (
            <p className="text-body-sm text-error">
              {jobsUsing === null
                ? refusal.message
                : `${plural(jobsUsing, 'job')} ${jobsUsing === 1 ? 'uses' : 'use'} this category. Merge it into another one instead.`}
            </p>
          ) : (
            <p className="text-body-sm text-text-secondary">
              Stop offering <span className="font-medium text-text-primary">{category.name}</span> in the job form. A
              category still used by jobs can&rsquo;t be retired — merge it into another category instead.
            </p>
          )}
        </Modal>
      )}
    </div>
  )
}

/**
 * Job Categories (owner decision 69c, 2026-10-08) — the managed list behind a job listing's
 * category, modelled on Fields of Study beside it. Rename and merge rewrite every listing (and
 * every student's job alert) holding the category, so tidying the list never strands anything.
 * There is no delete: a category is retired, or merged into another.
 */
export function JobCategoriesTab() {
  const categories = useJobCategories(true)
  const [search, setSearch] = useState('')
  const [adding, setAdding] = useState(false)
  const [editing, setEditing] = useState<JobCategory | null>(null)
  const [merging, setMerging] = useState<JobCategory | null>(null)
  const all = useMemo(() => categories.data ?? [], [categories.data])

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return all
    return all.filter((c) => c.name.toLowerCase().includes(q))
  }, [all, search])

  const columns: TableColumn<JobCategory>[] = [
    {
      key: 'name',
      header: 'Category',
      render: (c) => (
        <span className={c.active ? 'font-medium text-text-primary' : 'text-text-secondary line-through'}>{c.name}</span>
      ),
    },
    {
      key: 'jobs',
      header: 'Jobs',
      align: 'right',
      render: (c) => <span className="tabular-nums text-text-secondary">{c.job_count}</span>,
    },
    {
      key: 'actions',
      header: '',
      align: 'right',
      render: (c) => <CategoryRowActions category={c} onEdit={() => setEditing(c)} onMerge={() => setMerging(c)} />,
    },
  ]

  return (
    <div className="flex flex-col gap-md">
      <div className="flex items-start justify-between gap-md">
        <div className="flex max-w-2xl flex-col gap-xs">
          <p className="text-body-sm text-text-secondary">
            One list behind a job listing&rsquo;s category. Students filter jobs and set job alerts by these in the
            Sentpo app. Merge duplicates rather than keeping two names for one category.
          </p>
          <SettingsUsedIn places={['Job category', 'Sentpo job filters', 'Sentpo job alerts']} />
        </div>
        <Button size="sm" onClick={() => setAdding(true)}>
          Add Category
        </Button>
      </div>
      <Table
        columns={columns}
        rows={rows}
        rowKey={(c) => c.id}
        loading={categories.isLoading}
        error={categories.isError ? 'Could not load the job categories list.' : undefined}
        errorSource={categories.error}
        emptyMessage={search ? 'No category matches.' : 'No job categories yet.'}
        search={{ value: search, onChange: setSearch, placeholder: 'Search categories…' }}
      />
      {adding && <CategoryFormModal onClose={() => setAdding(false)} />}
      {editing && <CategoryFormModal category={editing} onClose={() => setEditing(null)} />}
      {merging && <MergeCategoryModal category={merging} categories={all} onClose={() => setMerging(null)} />}
    </div>
  )
}
