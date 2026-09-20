import { useMemo, useState, type FormEvent, type ReactNode } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Archive, ArchiveRestore, GitMerge, Pencil, Plus, Search, X } from 'lucide-react'
import { AdminShell } from '@/features/auth/AdminShell'
import { Button } from '@/components/Button'
import { Badge } from '@/components/Badge'
import { TextField } from '@/components/TextField'
import { SelectField } from '@/components/SelectField'
import { StateSelect } from '@/components/StateSelect'
import { CountrySelect } from '@/components/CountrySelect'
import { CompactSelect } from '@/components/CompactSelect'
import { Modal } from '@/components/Modal'
import { Table, type TableColumn } from '@/components/Table'
import { useCursorPagination } from '@/lib/pagination'
import { formatDate } from '@/lib/time'
import {
  useAdminInstitutions,
  useBulkDismissInstitutionSuggestions,
  useBulkResolveInstitutionSuggestions,
  useCreateInstitution,
  useInstitutions,
  useInstitutionSuggestions,
  useMergeInstitution,
  useUnmapInstitution,
  useUpdateInstitution,
  institutionLabel,
  nearMatchesOf,
  INSTITUTION_CONFIDENT_SCORE,
  type Institution,
  type InstitutionNearMatch,
  type InstitutionSuggestionGroup,
} from '@/queries/institutions'
import { showToast } from '@/lib/toast'

// Where nearly every student's school actually is. A default, not a rule (assumptions audit H11,
// approved 2026-09-19) — the form asks, and any country on the shared list is accepted.
const DEFAULT_INSTITUTION_COUNTRY = 'India'

/**
 * Platform staff surface for the institution a student comes FROM.
 *
 * The QUEUE is the point of this page. Filters over unresolved data under-report silently — a
 * student who typed their school has no `institution_id`, so they are absent from every institution
 * filter with nothing anywhere saying so. Letting the queue grow is therefore not a backlog, it is a
 * slow corruption of every audience count that uses this field.
 *
 * Built for a long queue (user, 2026-09-11 — "assume there are many"): the queue and the list are
 * tabs; the queue is a compact table of GROUPS — everyone who typed the same name in the same city
 * is one row and one decision — searchable, sortable and paged, oldest wait first.
 */

const QUEUE_PAGE_SIZE = 20

function guessType(name: string): 'school' | 'college' {
  return /\b(college|university|institute|polytechnic|iit|nit)\b/i.test(name) ? 'college' : 'school'
}

function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? '' : 's'}`
}

function baseName(i: Institution): string {
  const suffix = ` - ${i.city}`
  return i.name.endsWith(suffix) ? i.name.slice(0, -suffix.length) : i.name
}

function waitedFor(iso?: string | null): string {
  if (!iso) return '—'
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000)
  return days <= 0 ? 'Today' : `${days} day${days === 1 ? '' : 's'}`
}

function IconButton({ label, onClick, children }: { label: string; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className="flex h-9 w-9 items-center justify-center rounded-md text-text-secondary hover:bg-background hover:text-text-primary"
    >
      {children}
    </button>
  )
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
  // The school's own country (assumptions audit H11, approved 2026-09-19). Every institution used
  // to be assumed Indian, so a Nepali or Nigerian student's college could not be created at all:
  // the state field only ever offered states of India and the server refused anything else. India
  // stays the default because that is where almost every row is, but it is now an answer on the
  // form rather than a rule in the code. Existing rows show what they were created with; the
  // country is fixed after creation, which is why it is read-only when editing.
  const [country, setCountry] = useState(institution?.country ?? DEFAULT_INSTITUTION_COUNTRY)
  const [state, setState] = useState(institution?.state ?? '')
  const [type, setType] = useState<'school' | 'college'>(institution?.type ?? guessType(initialName ?? ''))
  const composed = name.trim() && city.trim() ? `${name.trim()} - ${city.trim()}` : 'Name - City'

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!name.trim() || !city.trim()) return
    const body = { name: name.trim(), city: city.trim(), state: state.trim() || null, type }
    const done = {
      onSuccess: (saved?: Institution) => {
        showToast(isEditing ? `${name.trim()} updated` : `${name.trim()} added`)
        if (saved) onSaved?.(saved)
        onClose()
      },
    }
    if (institution) update.mutate({ id: institution.id, ...body }, done)
    // `country` is create-only: the server reads it on POST but its PATCH has no country to change.
    else create.mutate({ ...body, country }, done)
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
        <TextField
          label="Name"
          required
          value={name}
          onChange={(e) => {
            setName(e.target.value)
            // A duplicate-name error (server-side, name+city) used to stick around after the admin
            // fixed the name — the error stayed in `mutation`'s own state, not tied to the fields it
            // was about, so nothing re-validated on edit (product review L13, 2026-09-12).
            if (mutation.isError) mutation.reset()
          }}
        />
        <div className="grid grid-cols-1 gap-md sm:grid-cols-2">
          <TextField
            label="City"
            required
            value={city}
            onChange={(e) => {
              setCity(e.target.value)
              if (mutation.isError) mutation.reset()
            }}
          />
          {isEditing ? (
            <TextField label="Country" value={country} disabled readOnly />
          ) : (
            <CountrySelect
              label="Country"
              required
              value={country}
              onChange={(next) => {
                setCountry(next)
                // A state of the old country is not a state of the new one.
                setState('')
              }}
            />
          )}
          {/* Follows the country, and becomes a free text field for a country with no published
              state list at all (StateSelect handles both) — H11. */}
          <StateSelect label="State/Province" country={country} value={state} onChange={setState} />
        </div>
        <SelectField label="Type" id="institution-type" value={type} onChange={(e) => setType(e.target.value as 'school' | 'college')}>
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

// Search the whole list and choose one row — for matching waiting students when the guesses miss,
// and for choosing the row to keep in a merge.
function PickInstitutionModal({
  title,
  intro,
  excludeId,
  actionLabel,
  pending,
  error,
  detail,
  guesses,
  onPick,
  onClose,
}: {
  title: string
  intro: string
  excludeId?: string
  actionLabel: string
  pending: boolean
  error?: string
  detail?: (picked: Institution) => ReactNode
  /**
   * The server's own ranked guesses, WITH the score and the words behind each one (assumptions
   * audit M5, product owner 2026-09-19). The ranking runs on seven undocumented weights and one
   * admin's reading of it is applied to everyone who typed that string, so the reasoning is shown
   * rather than implied. Omitted where there is nothing to guess from (picking a merge target).
   */
  guesses?: InstitutionNearMatch[]
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
        {guesses && guesses.length > 0 && (
          <div className="flex flex-col gap-xs">
            <p className="text-caption text-text-secondary">
              Best guesses, and why each one matched — a score under {INSTITUTION_CONFIDENT_SCORE} is a weak match.
            </p>
            <div className="flex flex-col divide-y divide-border overflow-hidden rounded-md border border-border">
              {guesses.map((i) => (
                <button
                  key={i.id}
                  type="button"
                  onClick={() => setPicked(i)}
                  className={`flex flex-col items-start gap-0.5 px-md py-sm text-left text-body-sm ${
                    picked?.id === i.id ? 'bg-primary/10 text-primary' : 'text-text-primary hover:bg-background'
                  }`}
                >
                  <span className="flex w-full items-center justify-between gap-sm">
                    <span>{institutionLabel(i)}</span>
                    <MatchScore score={i.score} />
                  </span>
                  <MatchReason tokens={i.matched_tokens} />
                </button>
              ))}
            </div>
          </div>
        )}
        <TextField label="Search by name or city" value={q} onChange={(e) => setQ(e.target.value)} placeholder="e.g. choice thiruvalla" />
        <div className="flex max-h-72 flex-col divide-y divide-border overflow-y-auto rounded-md border border-border">
          {results.isLoading && <p className="p-sm text-caption text-text-secondary">Searching…</p>}
          {!results.isLoading && rows.length === 0 && <p className="p-sm text-caption text-text-secondary">No institution matches.</p>}
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

/**
 * HOW SURE THE MACHINE IS, in words (assumptions audit M5, product owner 2026-09-19).
 *
 * 30 is the floor to be offered at all — one shared meaningful word. 60 or more is a containment
 * match, two shared words, or one shared word in the same city; below it a bulk resolve has to be
 * confirmed. The number is shown beside the wording because it is the number the server's own
 * threshold is about.
 */
function MatchScore({ score }: { score?: number }) {
  if (score == null) return null
  const weak = score < INSTITUTION_CONFIDENT_SCORE
  return (
    <Badge color={weak ? 'warning' : 'success'}>
      {weak ? 'Weak' : 'Close'} match · {score}
    </Badge>
  )
}

/** The words the two names share — the reasoning behind the score, in the admin's vocabulary (M5). */
function MatchReason({ tokens }: { tokens?: string[] }) {
  if (!tokens || tokens.length === 0) return null
  return <span className="text-caption text-text-secondary">Shares: {tokens.join(', ')}</span>
}

type QueueAction = { kind: 'pick' | 'create' | 'dismiss'; group: InstitutionSuggestionGroup }

/** A resolve the admin may still want back — what the Undo banner needs (M5). */
type MappedBatch = { userIds: string[]; institutionName: string; typed: string }

/** The 409 the server sends when the top score is under 60, held until the admin answers it (M5). */
type WeakMatch = {
  userIds: string[]
  institutionId: string
  institutionName: string
  /** What the group typed, carried so the Undo banner can name it after a confirmed retry. */
  typed: string
  message: string
  score?: number
}

function studentsLabel(g: InstitutionSuggestionGroup): string {
  const names = g.students.map((s) => s.user_name)
  return names.length <= 1 ? (names[0] ?? '—') : `${names[0]} +${names.length - 1}`
}

function QueueView() {
  const suggestions = useInstitutionSuggestions()
  const resolve = useBulkResolveInstitutionSuggestions()
  const dismiss = useBulkDismissInstitutionSuggestions()
  const unmap = useUnmapInstitution()
  const [search, setSearch] = useState('')
  const [sortBy, setSortBy] = useState<'oldest' | 'students'>('oldest')
  const [page, setPage] = useState(0)
  const [action, setAction] = useState<QueueAction | null>(null)
  const [note, setNote] = useState('')
  // The last resolve, kept so it can be taken back (assumptions audit M5, product owner
  // 2026-09-19). A bulk resolve is the one action on this page that can be wrong about fifty
  // people at once, and until `DELETE /institutions/suggestions/{user_id}` existed it could only
  // be corrected by asking every one of them to type their school again.
  const [mapped, setMapped] = useState<MappedBatch | null>(null)
  // A 409 `confirm_required` held until the admin answers it, rather than shown as a failure (M5).
  const [weak, setWeak] = useState<WeakMatch | null>(null)

  /**
   * One path for every resolve on this page, so the weak-match confirm and the Undo banner apply
   * to the best-match button, the Pick modal and Create alike (M5).
   */
  function runResolve(
    group: InstitutionSuggestionGroup,
    institution: { id: string; name: string },
    options: { confirm?: boolean; onDone?: () => void } = {},
  ) {
    const userIds = group.students.map((sItem) => sItem.user_id)
    resolve.mutate(
      { userIds, institutionId: institution.id, ...(options.confirm ? { confirm: true } : {}) },
      {
        onSuccess: () => {
          setWeak(null)
          setMapped({ userIds, institutionName: institution.name, typed: group.institution_raw })
          showToast(`Mapped to ${institution.name}`)
          options.onDone?.()
        },
        onError: (e) => {
          // Not a failure — a question. The server refuses a BULK resolve whose top score is
          // under 60 unless it is sent again with `confirm: true`.
          if (e.code === 'confirm_required') {
            setWeak({
              userIds,
              institutionId: institution.id,
              institutionName: institution.name,
              typed: group.institution_raw,
              message: e.message,
              score: typeof e.details?.score === 'number' ? e.details.score : undefined,
            })
          }
        },
      },
    )
  }

  const groups = useMemo(() => suggestions.data?.groups ?? [], [suggestions.data])
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    const rows = q
      ? groups.filter(
          (g) =>
            g.institution_raw.toLowerCase().includes(q) ||
            (g.institution_raw_city ?? '').toLowerCase().includes(q) ||
            g.students.some((s) => s.user_name.toLowerCase().includes(q)),
        )
      : groups
    // The server sends oldest first; "most students" puts the biggest single decisions on top.
    return sortBy === 'students' ? [...rows].sort((a, b) => b.student_count - a.student_count) : rows
  }, [groups, search, sortBy])
  const pageCount = Math.max(1, Math.ceil(filtered.length / QUEUE_PAGE_SIZE))
  const safePage = Math.min(page, pageCount - 1)
  const rows = filtered.slice(safePage * QUEUE_PAGE_SIZE, (safePage + 1) * QUEUE_PAGE_SIZE)
  const userIds = (g: InstitutionSuggestionGroup) => g.students.map((s) => s.user_id)

  const columns: TableColumn<InstitutionSuggestionGroup>[] = [
    {
      key: 'typed',
      header: 'Typed as',
      render: (g) => (
        <div className="flex flex-col">
          <span className="font-medium text-text-primary">&ldquo;{g.institution_raw}&rdquo;</span>
          <span className="text-caption text-text-secondary">{g.institution_raw_city ?? 'No city given'}</span>
        </div>
      ),
    },
    {
      key: 'students',
      header: 'Students',
      render: (g) => (
        <span className="text-body-sm text-text-primary" title={g.students.map((s) => s.user_name).join(', ')}>
          {studentsLabel(g)}
        </span>
      ),
    },
    {
      key: 'waiting',
      header: 'Waiting',
      hideBelow: 'md',
      render: (g) => (
        <span className="text-body-sm text-text-secondary" title={g.first_typed_at ? `Since ${formatDate(g.first_typed_at)}` : undefined}>
          {waitedFor(g.first_typed_at)}
        </span>
      ),
    },
    {
      // Matching is the easy path, deliberately — one click on the best guess. Students type "The
      // Choice School", "Choice School Kochi" and "choice school" for one place, and a queue where
      // "create" is easier than "match" grows three rows for it within a week.
      key: 'match',
      header: 'Best match',
      render: (g) => {
        const guesses = nearMatchesOf(g)
        const best = guesses[0]
        if (!best) return <span className="text-caption text-text-secondary">No close match</span>
        return (
          <div className="flex flex-col items-start gap-xs">
            <Button
              size="sm"
              variant="secondary"
              loading={resolve.isPending && resolve.variables?.institutionId === best.id}
              onClick={() => runResolve(g, best)}
            >
              Match to {best.name}
            </Button>
            {/* WHY it matched, and how sure (assumptions audit M5, product owner 2026-09-19).
                One shared token plus the same city clears the floor, and this row maps everyone
                who typed that string in a single click — so the reasoning is on screen before
                the click, not implied by the ordering. */}
            <div className="flex flex-col items-start gap-0.5">
              <MatchScore score={best.score} />
              <MatchReason tokens={best.matched_tokens} />
            </div>
            {guesses.length > 1 && (
              <span className="text-caption text-text-secondary">
                {plural(guesses.length - 1, 'other guess')} in Pick
              </span>
            )}
          </div>
        )
      },
    },
    {
      key: 'actions',
      header: '',
      align: 'right',
      render: (g) => (
        <div className="flex justify-end">
          <IconButton label="Pick from the list" onClick={() => setAction({ kind: 'pick', group: g })}>
            <Search className="h-4 w-4" />
          </IconButton>
          <IconButton label="Create a new institution" onClick={() => setAction({ kind: 'create', group: g })}>
            <Plus className="h-4 w-4" />
          </IconButton>
          <IconButton
            label="Not an institution — clear it"
            onClick={() => {
              setNote('')
              setAction({ kind: 'dismiss', group: g })
            }}
          >
            <X className="h-4 w-4" />
          </IconButton>
        </div>
      ),
    },
  ]

  const current = action?.group
  const who = current ? (current.student_count === 1 ? current.students[0]?.user_name : plural(current.student_count, 'student')) : ''

  return (
    <div className="flex flex-col gap-md">
      <p className="max-w-3xl text-body-sm text-text-secondary">
        Until a student here is mapped, they are invisible to every institution filter — absent from segments,
        broadcasts and audience counts alike, with no error anywhere to say so. Everyone who typed the same name and
        city is one row, so one decision maps them all.
      </p>
      {/* A failed resolve says so — except the weak-match 409, which is a question the dialog
          below asks rather than an error (M5). */}
      {resolve.isError && resolve.error.code !== 'confirm_required' && (
        <p className="text-body-sm text-error">{resolve.error.message}</p>
      )}
      {mapped && (
        <div className="flex flex-wrap items-center justify-between gap-sm rounded-md border border-border bg-background px-md py-sm">
          <p className="text-body-sm text-text-primary">
            Mapped {plural(mapped.userIds.length, 'student')} who typed &ldquo;{mapped.typed}&rdquo; to{' '}
            <span className="font-medium">{mapped.institutionName}</span>.
          </p>
          <div className="flex items-center gap-sm">
            {unmap.isError && <span className="text-body-sm text-error">{unmap.error.message}</span>}
            {/* UNMAP (M5) — restores what each student typed and puts them back in the queue. */}
            <Button
              size="sm"
              variant="secondary"
              loading={unmap.isPending}
              onClick={() =>
                unmap.mutate(
                  { userIds: mapped.userIds, note: `Unmapped from ${mapped.institutionName}` },
                  {
                    onSuccess: () => {
                      setMapped(null)
                      showToast('Back in the queue')
                    },
                  },
                )
              }
            >
              Unmap
            </Button>
            <Button size="sm" variant="secondary" onClick={() => setMapped(null)}>
              Dismiss
            </Button>
          </div>
        </div>
      )}
      <Table
        columns={columns}
        rows={rows}
        rowKey={(g) => g.key}
        loading={suggestions.isLoading}
        error={suggestions.isError ? 'Could not load the queue.' : undefined}
        emptyMessage={search ? 'Nothing in the queue matches.' : 'Nothing waiting — every student’s school is resolved.'}
        search={{
          value: search,
          onChange: (value) => {
            setSearch(value)
            setPage(0)
          },
          placeholder: 'Search what was typed, city or student…',
        }}
        filters={
          <CompactSelect
            value={sortBy}
            onChange={(e) => {
              setSortBy(e.target.value as 'oldest' | 'students')
              setPage(0)
            }}
            label="Sort"
          >
            <option value="oldest">Waiting longest</option>
            <option value="students">Most students</option>
          </CompactSelect>
        }
        pagination={{
          hasNext: safePage < pageCount - 1,
          hasPrevious: safePage > 0,
          onNext: () => setPage(safePage + 1),
          onPrevious: () => setPage(Math.max(0, safePage - 1)),
          total: filtered.length,
        }}
      />

      {action?.kind === 'pick' && current && (
        <PickInstitutionModal
          title={`Map “${current.institution_raw}”`}
          intro={`Choose the school or college this refers to. ${who} will be mapped to it.`}
          actionLabel={current.student_count === 1 ? 'Map student' : `Map ${current.student_count} students`}
          pending={resolve.isPending}
          error={resolve.isError && resolve.error.code !== 'confirm_required' ? resolve.error.message : undefined}
          guesses={nearMatchesOf(current)}
          onClose={() => setAction(null)}
          onPick={(picked) => runResolve(current, picked, { onDone: () => setAction(null) })}
        />
      )}
      {action?.kind === 'create' && current && (
        <InstitutionFormModal
          initialName={current.institution_raw}
          initialCity={current.institution_raw_city ?? ''}
          onClose={() => setAction(null)}
          onSaved={(created) => runResolve(current, created)}
        />
      )}
      {action?.kind === 'dismiss' && current && (
        <Modal
          onClose={() => setAction(null)}
          title="Not an institution"
          widthRem={28}
          footer={
            <>
              {dismiss.isError && <p className="mr-auto self-center text-body-sm text-error">{dismiss.error.message}</p>}
              <Button variant="secondary" onClick={() => setAction(null)}>
                Cancel
              </Button>
              <Button
                variant="destructive"
                loading={dismiss.isPending}
                onClick={() =>
                  dismiss.mutate({ userIds: userIds(current), note: note.trim() || undefined }, { onSuccess: () => setAction(null) })
                }
              >
                Clear it
              </Button>
            </>
          }
        >
          <div className="flex flex-col gap-md">
            <p className="text-body-sm text-text-secondary">
              &ldquo;{current.institution_raw}&rdquo; is cleared from {who}&rsquo;s profile and leaves the queue — no
              institution is created or matched. They can enter their school again.
            </p>
            <TextField label="Note (optional)" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Recorded in the audit log." />
          </div>
        </Modal>
      )}

      {/* A WEAK MATCH IS ASKED ABOUT, NOT REFUSED (assumptions audit M5, product owner
          2026-09-19). The server answers 409 `confirm_required` when the best score in the batch
          is under 60 — one shared word, or one shared word and the same city, which is exactly
          how a whole group got mapped to the wrong school on a single click. The admin sees the
          server's own wording and, if they still mean it, the same request goes again with
          `confirm: true`. */}
      {weak && (
        <Modal
          onClose={() => setWeak(null)}
          title="Check this match"
          widthRem={28}
          footer={
            <>
              {resolve.isError && resolve.error.code !== 'confirm_required' && (
                <p className="mr-auto self-center text-body-sm text-error">{resolve.error.message}</p>
              )}
              <Button variant="secondary" onClick={() => setWeak(null)}>
                Cancel
              </Button>
              <Button
                loading={resolve.isPending}
                onClick={() =>
                  resolve.mutate(
                    { userIds: weak.userIds, institutionId: weak.institutionId, confirm: true },
                    {
                      onSuccess: () => {
                        // The group's own typed text, carried on the held 409 (M5) — reading it
                        // off `action` was empty whenever the weak match came from the row's
                        // best-match button rather than from the Pick dialog.
                        setMapped({
                          userIds: weak.userIds,
                          institutionName: weak.institutionName,
                          typed: weak.typed,
                        })
                        setWeak(null)
                        setAction(null)
                        showToast(`Mapped to ${weak.institutionName}`)
                      },
                    },
                  )
                }
              >
                Map them anyway
              </Button>
            </>
          }
        >
          <div className="flex flex-col gap-md">
            <p className="text-body-sm text-text-primary">{weak.message}</p>
            {weak.score != null && (
              <p className="text-caption text-text-secondary">
                Match score {weak.score} out of a confident {INSTITUTION_CONFIDENT_SCORE}. If this is the wrong school,
                pick another from the list or create a new one — and if you map them and change your mind, Unmap puts
                them straight back in the queue.
              </p>
            )}
          </div>
        </Modal>
      )}
    </div>
  )
}

// Same pattern as CollegeDetailPage's college/course switch-off (2026-09-12, product review H14)
// — Retire used to fire straight from the icon with no confirmation at all, on an action that
// looks a lot like a delete. Restore stays a single click: it only ever adds the institution back
// as a choice, nothing about it is destructive.
function RetireConfirmModal({
  institution,
  loading,
  onConfirm,
  onClose,
}: {
  institution: Institution
  loading: boolean
  onConfirm: () => void
  onClose: () => void
}) {
  return (
    <Modal
      onClose={onClose}
      title={`Retire ${institution.name}?`}
      widthRem={28}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="destructive" loading={loading} onClick={onConfirm}>
            Retire
          </Button>
        </>
      }
    >
      <p className="text-body-sm text-text-secondary">
        {plural(institution.student_count ?? 0, 'student')} list it as their school. They keep it; it just stops
        being offered as a choice. You can restore it later.
      </p>
    </Modal>
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
  const [confirmingRetire, setConfirmingRetire] = useState(false)
  return (
    <div className="flex items-center justify-end gap-xs">
      <IconButton label={`Edit ${institution.name}`} onClick={onEdit}>
        <Pencil className="h-4 w-4" />
      </IconButton>
      <IconButton label={`Merge ${institution.name} into another institution`} onClick={onMerge}>
        <GitMerge className="h-4 w-4" />
      </IconButton>
      <button
        type="button"
        onClick={() => (retired ? update.mutate({ id: institution.id, active: true }) : setConfirmingRetire(true))}
        disabled={update.isPending}
        aria-label={retired ? `Restore ${institution.name}` : `Retire ${institution.name}`}
        title={retired ? 'Restore — offer it to students again' : 'Retire — stop offering it to students'}
        className="flex h-9 w-9 items-center justify-center rounded-md text-text-secondary hover:bg-background hover:text-text-primary disabled:opacity-40"
      >
        {retired ? <ArchiveRestore className="h-4 w-4" /> : <Archive className="h-4 w-4" />}
      </button>
      {confirmingRetire && (
        <RetireConfirmModal
          institution={institution}
          loading={update.isPending}
          onClose={() => setConfirmingRetire(false)}
          onConfirm={() =>
            update.mutate({ id: institution.id, active: false }, { onSuccess: () => setConfirmingRetire(false) })
          }
        />
      )}
    </div>
  )
}

function AllInstitutionsView() {
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
          <span className={i.active === false ? 'text-text-secondary line-through' : 'font-medium text-text-primary'}>{i.name}</span>
          {i.active === false && <Badge color="secondary">Retired</Badge>}
        </span>
      ),
    },
    { key: 'city', header: 'City', hideBelow: 'md', render: (i) => i.city },
    { key: 'state', header: 'State/Province', hideBelow: 'lg', render: (i) => i.state ?? '—' },
    // Institutions are no longer all Indian (assumptions audit H11, approved 2026-09-19), so the
    // list has to say which country a row is in — two "St. Xavier's - Kathmandu" rows are
    // otherwise indistinguishable from a duplicate.
    {
      key: 'country',
      header: 'Country',
      hideBelow: 'lg',
      render: (i) => i.country ?? DEFAULT_INSTITUTION_COUNTRY,
    },
    {
      key: 'type',
      header: 'Type',
      render: (i) => <Badge color={i.type === 'school' ? 'primary' : 'secondary'}>{i.type === 'school' ? 'School' : 'College'}</Badge>,
    },
    {
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
    <>
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
            <CompactSelect value={typeFilter} onChange={(e) => { setTypeFilter(e.target.value as '' | 'school' | 'college'); resetPaging() }} label="Type">
              <option value="">Any type</option>
              <option value="school">Schools</option>
              <option value="college">Colleges</option>
            </CompactSelect>
            <CompactSelect value={cityFilter} onChange={(e) => { setCityFilter(e.target.value); resetPaging() }} label="City">
              <option value="">Any city</option>
              {(facets?.cities ?? []).map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </CompactSelect>
            <CompactSelect value={stateFilter} onChange={(e) => { setStateFilter(e.target.value); resetPaging() }} label="State">
              <option value="">Any state</option>
              {(facets?.states ?? []).map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </CompactSelect>
            <CompactSelect
              value={statusFilter}
              onChange={(e) => { setStatusFilter(e.target.value as 'active' | 'retired' | 'all'); resetPaging() }}
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
                {plural(merging.student_count ?? 0, 'student')} move to <span className="font-medium text-text-primary">{target.name}</span>.
              </li>
              <li>Saved audiences (ads, quizzes, broadcasts) that named it now name {target.name}.</li>
              <li>{merging.name} is removed. This can&rsquo;t be undone.</li>
            </ul>
          )}
          onClose={() => setMerging(null)}
          onPick={(target) =>
            merge.mutate(
              { id: merging.id, intoId: target.id },
              {
                onSuccess: () => {
                  showToast(`${merging.name} merged into ${target.name}`)
                  setMerging(null)
                },
              },
            )
          }
        />
      )}
    </>
  )
}

export function InstitutionsPage() {
  const suggestions = useInstitutionSuggestions()
  const [adding, setAdding] = useState(false)
  // ?tab=queue (Needs attention's "Schools to map" card) forces the queue tab open even on the
  // rare visit where it would otherwise default to All — e.g. it just emptied in another tab.
  const [searchParams] = useSearchParams()
  const [tab, setTab] = useState<'queue' | 'all' | null>(() => (searchParams.get('tab') === 'queue' ? 'queue' : null))
  const waitingStudents = suggestions.data?.student_count ?? 0
  const waitingGroups = suggestions.data?.groups?.length ?? 0
  // Opens on the queue while anyone is waiting — it is the work — and on the list when it is clear.
  const activeTab = tab ?? (waitingGroups > 0 ? 'queue' : 'all')

  return (
    <AdminShell>
      <div className="flex flex-col gap-lg">
        <div className="flex items-start justify-between gap-md">
          <div>
            <h1 className="text-h1 text-text-primary">Institutions</h1>
            <p className="text-body-sm text-text-secondary">
              The schools and colleges students come FROM — separate from Colleges &amp; Courses, which are
              destinations abroad. Students pick from this list; anything they type instead waits to be mapped.
            </p>
          </div>
          <div className="shrink-0">
            <Button onClick={() => setAdding(true)}>Add Institution</Button>
          </div>
        </div>

        <div role="tablist" aria-label="Institutions" className="flex gap-lg border-b border-border">
          {(
            [
              { key: 'queue', label: 'Waiting to be mapped' },
              { key: 'all', label: 'All institutions' },
            ] as const
          ).map((t) => (
            <button
              key={t.key}
              type="button"
              role="tab"
              aria-selected={activeTab === t.key}
              onClick={() => setTab(t.key)}
              className={`-mb-px flex items-center gap-xs border-b-2 py-sm text-body-sm font-medium ${
                activeTab === t.key ? 'border-primary text-primary' : 'border-transparent text-text-secondary hover:text-text-primary'
              }`}
            >
              {t.label}
              {t.key === 'queue' && waitingGroups > 0 && (
                <Badge color="warning">
                  {waitingGroups === waitingStudents ? waitingGroups : `${waitingGroups} · ${plural(waitingStudents, 'student')}`}
                </Badge>
              )}
            </button>
          ))}
        </div>

        {activeTab === 'queue' ? <QueueView /> : <AllInstitutionsView />}
      </div>

      {adding && <InstitutionFormModal onClose={() => setAdding(false)} />}
    </AdminShell>
  )
}
