import { useState, type FormEvent } from 'react'
import { Archive, ArchiveRestore, GitMerge, Pencil } from 'lucide-react'
import { AdminShell } from '@/features/auth/AdminShell'
import { Button } from '@/components/Button'
import { Badge } from '@/components/Badge'
import { TextField } from '@/components/TextField'
import { SelectField } from '@/components/SelectField'
import { CompactSelect } from '@/components/CompactSelect'
import { Modal } from '@/components/Modal'
import { Table, type TableColumn } from '@/components/Table'
import { ErrorState, Skeleton } from '@/components/QueryState'
import { useCursorPagination } from '@/lib/pagination'
import { formatDate } from '@/lib/time'
import {
  useAdminInstitutions,
  useCreateInstitution,
  useDismissInstitutionSuggestion,
  useInstitutions,
  useInstitutionSuggestions,
  useMergeInstitution,
  useResolveInstitutionSuggestion,
  useUpdateInstitution,
  institutionLabel,
  type Institution,
  type InstitutionSuggestion,
} from '@/queries/institutions'

/**
 * Platform staff surface for the institution a student comes FROM.
 *
 * The QUEUE is the point of this page, so it sits above the list. Filters over unresolved data
 * under-report silently — a student who typed their school has no `institution_id`, so they are
 * absent from every institution filter with nothing anywhere saying so. Letting the queue grow is
 * therefore not a backlog, it is a slow corruption of every audience count that uses this field.
 *
 * Review pass (2026-09-11): rows can now be edited, retired and merged; the queue can pick any
 * school from the list or clear an entry that is not a school; the list is paged and filtered.
 */

// What a typed name most likely is, so "Create new institution" starts on the right type.
function guessType(name: string): 'school' | 'college' {
  return /\b(college|university|institute|polytechnic|iit|nit)\b/i.test(name) ? 'college' : 'school'
}

function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? '' : 's'}`
}

// The name without the " - City" the server appends, for editing.
function baseName(i: Institution): string {
  const suffix = ` - ${i.city}`
  return i.name.endsWith(suffix) ? i.name.slice(0, -suffix.length) : i.name
}

function InstitutionFormModal({
  institution,
  initialName,
  initialCity,
  onClose,
  onSaved,
}: {
  institution?: Institution
  initialName?: string
  initialCity?: string
  onClose: () => void
  onSaved?: (institution: Institution) => void
}) {
  const isEditing = Boolean(institution)
  const create = useCreateInstitution()
  const update = useUpdateInstitution()
  const mutation = isEditing ? update : create
  const [name, setName] = useState(institution ? baseName(institution) : (initialName ?? ''))
  const [city, setCity] = useState(institution?.city ?? initialCity ?? '')
  const [state, setState] = useState(institution?.state ?? '')
  const [type, setType] = useState<'school' | 'college'>(institution?.type ?? guessType(initialName ?? ''))
  const composed = name.trim() && city.trim() ? `${name.trim()} - ${city.trim()}` : 'Name - City'

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!name.trim() || !city.trim()) return
    const body = { name: name.trim(), city: city.trim(), state: state.trim() || null, type }
    const done = {
      onSuccess: (saved?: Institution) => {
        if (saved) onSaved?.(saved)
        onClose()
      },
    }
    if (institution) update.mutate({ id: institution.id, ...body }, done)
    else create.mutate(body, done)
  }

  return (
    <Modal
      onClose={onClose}
      title={isEditing ? 'Edit Institution' : 'Add Institution'}
      widthRem={28}
      footer={
        <>
          {mutation.isError && <p className="mr-auto self-center text-body-sm text-error">{mutation.error.message}</p>}
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="institution-form" loading={mutation.isPending} disabled={!name.trim() || !city.trim()}>
            {isEditing ? 'Save Changes' : 'Add Institution'}
          </Button>
        </>
      }
    >
      <form id="institution-form" onSubmit={handleSubmit} className="flex flex-col gap-md">
        <TextField label="Name" required value={name} onChange={(e) => setName(e.target.value)} />
        <div className="grid grid-cols-1 gap-md sm:grid-cols-2">
          <TextField label="City" required value={city} onChange={(e) => setCity(e.target.value)} />
          <TextField label="State/Province" value={state} onChange={(e) => setState(e.target.value)} />
        </div>
        <SelectField
          label="Type"
          id="institution-type"
          value={type}
          onChange={(e) => setType(e.target.value as 'school' | 'college')}
        >
          <option value="school">School</option>
          <option value="college">College</option>
        </SelectField>
        <p className="text-caption text-text-secondary">
          Saves as <strong>{composed}</strong> — the city is part of the name, because &ldquo;The Choice School&rdquo;
          in Kochi and in Thiruvalla are separate schools. The same name in the same city is refused.
        </p>
      </form>
    </Modal>
  )
}

// Search the whole list and choose one row — for matching a waiting student when the guesses miss,
// and for choosing the row to keep in a merge.
function PickInstitutionModal({
  title,
  intro,
  excludeId,
  actionLabel,
  pending,
  error,
  detail,
  onPick,
  onClose,
}: {
  title: string
  intro: string
  excludeId?: string
  actionLabel: string
  pending: boolean
  error?: string
  detail?: (picked: Institution) => React.ReactNode
  onPick: (picked: Institution) => void
  onClose: () => void
}) {
  const [q, setQ] = useState('')
  const [picked, setPicked] = useState<Institution | null>(null)
  const results = useInstitutions(q.trim() || undefined)
  const rows = (results.data?.items ?? []).filter((i) => i.id !== excludeId)

  return (
    <Modal
      onClose={onClose}
      title={title}
      widthRem={32}
      footer={
        <>
          {error && <p className="mr-auto self-center text-body-sm text-error">{error}</p>}
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button loading={pending} disabled={!picked} onClick={() => picked && onPick(picked)}>
            {actionLabel}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-md">
        <p className="text-body-sm text-text-secondary">{intro}</p>
        <TextField label="Search by name or city" value={q} onChange={(e) => setQ(e.target.value)} placeholder="e.g. choice thiruvalla" />
        <div className="flex max-h-72 flex-col divide-y divide-border overflow-y-auto rounded-md border border-border">
          {results.isLoading && <p className="p-sm text-caption text-text-secondary">Searching…</p>}
          {!results.isLoading && rows.length === 0 && (
            <p className="p-sm text-caption text-text-secondary">No institution matches.</p>
          )}
          {rows.map((i) => (
            <button
              key={i.id}
              type="button"
              onClick={() => setPicked(i)}
              className={`flex items-center justify-between gap-sm px-md py-sm text-left text-body-sm ${
                picked?.id === i.id ? 'bg-primary/10 text-primary' : 'text-text-primary hover:bg-background'
              }`}
            >
              <span>{institutionLabel(i)}</span>
              <span className="flex shrink-0 items-center gap-xs text-caption text-text-secondary">
                {plural(i.student_count ?? 0, 'student')}
                <Badge color={i.type === 'school' ? 'primary' : 'secondary'}>{i.type === 'school' ? 'School' : 'College'}</Badge>
              </span>
            </button>
          ))}
        </div>
        {picked && detail?.(picked)}
      </div>
    </Modal>
  )
}

function SuggestionRow({ suggestion }: { suggestion: InstitutionSuggestion }) {
  const resolve = useResolveInstitutionSuggestion()
  const dismiss = useDismissInstitutionSuggestion()
  const [creating, setCreating] = useState(false)
  const [picking, setPicking] = useState(false)
  const [dismissing, setDismissing] = useState(false)
  const [note, setNote] = useState('')
  const near = suggestion.near_matches ?? []

  return (
    <div className="flex flex-col gap-sm rounded-md border border-border bg-surface p-md">
      <div className="flex flex-wrap items-baseline justify-between gap-sm">
        <div className="flex flex-wrap items-baseline gap-xs">
          <span className="text-body font-medium text-text-primary">{suggestion.user_name}</span>
          <span className="text-body-sm text-text-secondary">typed</span>
          <span className="text-body text-text-primary">&ldquo;{suggestion.institution_raw}&rdquo;</span>
          {suggestion.institution_raw_city && (
            <span className="text-body-sm text-text-secondary">in {suggestion.institution_raw_city}</span>
          )}
        </div>
        {suggestion.typed_at && (
          <span className="text-caption text-text-secondary">on {formatDate(suggestion.typed_at)}</span>
        )}
      </div>

      {/* Matching comes FIRST, deliberately. Students type "The Choice School", "Choice School
          Kochi" and "choice school" for one place; a queue where "create" is the easy path grows
          three rows for it inside a week. */}
      {near.length > 0 ? (
        <div className="flex flex-col gap-xs">
          <p className="text-caption text-text-secondary">Looks like one of these:</p>
          <div className="flex flex-wrap gap-xs">
            {near.map((m) => (
              <Button
                key={m.id}
                variant="secondary"
                loading={resolve.isPending}
                onClick={() => resolve.mutate({ userId: suggestion.user_id, institutionId: m.id })}
              >
                {institutionLabel(m)}
              </Button>
            ))}
          </div>
        </div>
      ) : (
        <p className="text-caption text-text-secondary">No close match in the list.</p>
      )}

      <div className="flex flex-wrap gap-sm">
        <Button variant="secondary" onClick={() => setPicking(true)}>
          Pick from the list…
        </Button>
        <Button variant="secondary" onClick={() => setCreating(true)}>
          Create new institution
        </Button>
        <Button variant="secondary" onClick={() => setDismissing(true)}>
          Not an institution
        </Button>
      </div>

      {resolve.isError && <p className="text-body-sm text-error">{resolve.error.message}</p>}

      {creating && (
        <InstitutionFormModal
          initialName={suggestion.institution_raw}
          initialCity={suggestion.institution_raw_city ?? ''}
          onClose={() => setCreating(false)}
          onSaved={(created) => resolve.mutate({ userId: suggestion.user_id, institutionId: created.id })}
        />
      )}
      {picking && (
        <PickInstitutionModal
          title={`Map ${suggestion.user_name}`}
          intro={`Choose the school or college "${suggestion.institution_raw}" refers to.`}
          actionLabel="Map student"
          pending={resolve.isPending}
          error={resolve.isError ? resolve.error.message : undefined}
          onClose={() => setPicking(false)}
          onPick={(picked) =>
            resolve.mutate(
              { userId: suggestion.user_id, institutionId: picked.id },
              { onSuccess: () => setPicking(false) },
            )
          }
        />
      )}
      {dismissing && (
        <Modal
          onClose={() => setDismissing(false)}
          title="Not an institution"
          widthRem={28}
          footer={
            <>
              {dismiss.isError && <p className="mr-auto self-center text-body-sm text-error">{dismiss.error.message}</p>}
              <Button variant="secondary" onClick={() => setDismissing(false)}>
                Cancel
              </Button>
              <Button
                variant="destructive"
                loading={dismiss.isPending}
                onClick={() =>
                  dismiss.mutate(
                    { userId: suggestion.user_id, note: note.trim() || undefined },
                    { onSuccess: () => setDismissing(false) },
                  )
                }
              >
                Clear it
              </Button>
            </>
          }
        >
          <div className="flex flex-col gap-md">
            <p className="text-body-sm text-text-secondary">
              &ldquo;{suggestion.institution_raw}&rdquo; is cleared from {suggestion.user_name}&rsquo;s profile and leaves
              the queue — no institution is created or matched. They can enter their school again.
            </p>
            <TextField label="Note (optional)" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Recorded in the audit log." />
          </div>
        </Modal>
      )}
    </div>
  )
}

function InstitutionRowActions({
  institution,
  onEdit,
  onMerge,
}: {
  institution: Institution
  onEdit: () => void
  onMerge: () => void
}) {
  const update = useUpdateInstitution()
  const retired = institution.active === false
  return (
    <div className="flex items-center justify-end gap-xs">
      <button
        type="button"
        onClick={onEdit}
        aria-label={`Edit ${institution.name}`}
        title="Edit"
        className="flex h-9 w-9 items-center justify-center rounded-md text-text-secondary hover:bg-background hover:text-text-primary"
      >
        <Pencil className="h-4 w-4" />
      </button>
      <button
        type="button"
        onClick={onMerge}
        aria-label={`Merge ${institution.name} into another institution`}
        title="Merge into another institution"
        className="flex h-9 w-9 items-center justify-center rounded-md text-text-secondary hover:bg-background hover:text-text-primary"
      >
        <GitMerge className="h-4 w-4" />
      </button>
      <button
        type="button"
        onClick={() => update.mutate({ id: institution.id, active: retired })}
        disabled={update.isPending}
        aria-label={retired ? `Restore ${institution.name}` : `Retire ${institution.name}`}
        title={retired ? 'Restore — offer it to students again' : 'Retire — stop offering it to students'}
        className="flex h-9 w-9 items-center justify-center rounded-md text-text-secondary hover:bg-background hover:text-text-primary disabled:opacity-40"
      >
        {retired ? <ArchiveRestore className="h-4 w-4" /> : <Archive className="h-4 w-4" />}
      </button>
    </div>
  )
}

export function InstitutionsPage() {
  const suggestions = useInstitutionSuggestions()
  const [adding, setAdding] = useState(false)
  const [editing, setEditing] = useState<Institution | null>(null)
  const [merging, setMerging] = useState<Institution | null>(null)
  const merge = useMergeInstitution()

  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState<'' | 'school' | 'college'>('')
  const [cityFilter, setCityFilter] = useState('')
  const [stateFilter, setStateFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState<'active' | 'retired' | 'all'>('active')
  const [sort, setSort] = useState<{ field: string; direction: 'asc' | 'desc' } | null>(null)
  const paging = useCursorPagination()
  const list = useAdminInstitutions({
    q: search || undefined,
    type: typeFilter || undefined,
    city: cityFilter || undefined,
    state: stateFilter || undefined,
    status: statusFilter,
    sort: sort ? (sort.direction === 'desc' ? `-${sort.field}` : sort.field) : undefined,
    cursor: paging.cursor,
    limit: 25,
  })
  const facets = list.data?.facets
  const waiting = suggestions.data?.items ?? []

  function resetPaging() {
    paging.reset()
  }

  const columns: TableColumn<Institution>[] = [
    {
      key: 'name',
      header: 'Institution',
      sortable: true,
      render: (i) => (
        <span className="flex items-center gap-xs">
          <span className={i.active === false ? 'text-text-secondary line-through' : 'font-medium text-text-primary'}>
            {i.name}
          </span>
          {i.active === false && <Badge color="secondary">Retired</Badge>}
        </span>
      ),
    },
    { key: 'city', header: 'City', hideBelow: 'md', render: (i) => i.city },
    { key: 'state', header: 'State/Province', hideBelow: 'lg', render: (i) => i.state ?? '—' },
    {
      key: 'type',
      header: 'Type',
      render: (i) => (
        <Badge color={i.type === 'school' ? 'primary' : 'secondary'}>{i.type === 'school' ? 'School' : 'College'}</Badge>
      ),
    },
    {
      // Which schools matter, and which duplicate to keep in a merge (2026-09-11).
      key: 'student_count',
      header: 'Students',
      sortable: true,
      align: 'right',
      render: (i) => <span className="tabular-nums">{i.student_count ?? 0}</span>,
    },
    {
      key: 'actions',
      header: '',
      align: 'right',
      render: (i) => <InstitutionRowActions institution={i} onEdit={() => setEditing(i)} onMerge={() => setMerging(i)} />,
    },
  ]

  return (
    <AdminShell>
      <div className="flex flex-col gap-lg">
        <div className="flex items-start justify-between gap-md">
          <div>
            <h1 className="text-h1 text-text-primary">Institutions</h1>
            <p className="text-body-sm text-text-secondary">
              The schools and colleges students come FROM — separate from Colleges &amp; Courses, which are
              destinations abroad. Students pick from this list; anything they type instead lands in the queue below.
            </p>
          </div>
          <div className="shrink-0">
            <Button onClick={() => setAdding(true)}>Add Institution</Button>
          </div>
        </div>

        <section className="flex flex-col gap-sm">
          <div className="flex items-baseline gap-sm">
            <h2 className="text-h2 text-text-primary">Waiting to be mapped</h2>
            {waiting.length > 0 && <Badge color="warning">{waiting.length}</Badge>}
          </div>
          <p className="text-body-sm text-text-secondary">
            Until a student here is mapped, they are invisible to every institution filter — absent from segments,
            broadcasts and audience counts alike, with no error anywhere to say so.
          </p>
          {suggestions.isLoading && <Skeleton className="h-24 rounded-lg" />}
          {suggestions.isError && <ErrorState message="Could not load the queue." onRetry={() => suggestions.refetch()} />}
          {suggestions.data && waiting.length === 0 && (
            <p className="text-body-sm text-text-secondary">Nothing waiting — every student&rsquo;s school is resolved.</p>
          )}
          {waiting.map((s) => (
            <SuggestionRow key={s.user_id} suggestion={s} />
          ))}
        </section>

        <section className="flex flex-col gap-sm">
          <h2 className="text-h2 text-text-primary">All institutions</h2>
          <Table
            columns={columns}
            rows={list.data?.items ?? []}
            rowKey={(i) => i.id}
            loading={list.isLoading}
            error={list.isError ? 'Could not load institutions.' : undefined}
            emptyMessage={
              search || typeFilter || cityFilter || stateFilter || statusFilter !== 'active'
                ? 'No institutions match these filters.'
                : "No institutions yet. Add one with Add Institution above, or map a waiting student's school."
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
              placeholder: 'Search name, city or state…',
            }}
            filters={
              <>
                <CompactSelect
                  value={typeFilter}
                  onChange={(e) => {
                    setTypeFilter(e.target.value as '' | 'school' | 'college')
                    resetPaging()
                  }}
                  label="Type"
                >
                  <option value="">Any type</option>
                  <option value="school">Schools</option>
                  <option value="college">Colleges</option>
                </CompactSelect>
                <CompactSelect
                  value={cityFilter}
                  onChange={(e) => {
                    setCityFilter(e.target.value)
                    resetPaging()
                  }}
                  label="City"
                >
                  <option value="">Any city</option>
                  {(facets?.cities ?? []).map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </CompactSelect>
                <CompactSelect
                  value={stateFilter}
                  onChange={(e) => {
                    setStateFilter(e.target.value)
                    resetPaging()
                  }}
                  label="State"
                >
                  <option value="">Any state</option>
                  {(facets?.states ?? []).map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </CompactSelect>
                <CompactSelect
                  value={statusFilter}
                  onChange={(e) => {
                    setStatusFilter(e.target.value as 'active' | 'retired' | 'all')
                    resetPaging()
                  }}
                  label="Status"
                >
                  <option value="active">Offered to students</option>
                  <option value="retired">Retired</option>
                  <option value="all">All</option>
                </CompactSelect>
              </>
            }
            pagination={{
              hasNext: Boolean(list.data?.meta?.next_cursor),
              hasPrevious: paging.hasPrevious,
              onNext: () => list.data?.meta?.next_cursor && paging.next(list.data.meta.next_cursor),
              onPrevious: paging.previous,
              total: list.data?.meta?.total,
            }}
          />
        </section>
      </div>

      {adding && <InstitutionFormModal onClose={() => setAdding(false)} />}
      {editing && <InstitutionFormModal institution={editing} onClose={() => setEditing(null)} />}
      {merging && (
        <PickInstitutionModal
          title={`Merge ${merging.name}`}
          intro="For a duplicate. Choose the institution to keep."
          excludeId={merging.id}
          actionLabel="Merge"
          pending={merge.isPending}
          error={merge.isError ? merge.error.message : undefined}
          detail={(target) => (
            <ul className="flex list-disc flex-col gap-xs pl-lg text-body-sm text-text-secondary">
              <li>
                {plural(merging.student_count ?? 0, 'student')} move to{' '}
                <span className="font-medium text-text-primary">{target.name}</span>.
              </li>
              <li>Saved audiences (ads, quizzes, broadcasts) that named it now name {target.name}.</li>
              <li>{merging.name} is removed. This can&rsquo;t be undone.</li>
            </ul>
          )}
          onClose={() => setMerging(null)}
          onPick={(target) => merge.mutate({ id: merging.id, intoId: target.id }, { onSuccess: () => setMerging(null) })}
        />
      )}
    </AdminShell>
  )
}
