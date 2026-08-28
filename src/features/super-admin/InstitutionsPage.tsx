import { useState, type FormEvent } from 'react'
import { AdminShell } from '@/features/auth/AdminShell'
import { Button } from '@/components/Button'
import { Badge } from '@/components/Badge'
import { TextField } from '@/components/TextField'
import { SelectField } from '@/components/SelectField'
import { Modal } from '@/components/Modal'
import { Table, type TableColumn } from '@/components/Table'
import { ErrorState, Skeleton } from '@/components/QueryState'
import {
  useInstitutions,
  useInstitutionSuggestions,
  useCreateInstitution,
  useResolveInstitutionSuggestion,
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
 */

function CreateInstitutionModal({
  initialName,
  initialCity,
  onClose,
  onCreated,
}: {
  initialName?: string
  initialCity?: string
  onClose: () => void
  onCreated?: (institution: Institution) => void
}) {
  const create = useCreateInstitution()
  const [name, setName] = useState(initialName ?? '')
  const [city, setCity] = useState(initialCity ?? '')
  const [state, setState] = useState('')
  const [type, setType] = useState<'school' | 'college'>('school')

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!name.trim() || !city.trim()) return
    create.mutate(
      { name: name.trim(), city: city.trim(), state: state.trim() || null, type },
      {
        onSuccess: (created) => {
          if (created) onCreated?.(created)
          onClose()
        },
      },
    )
  }

  return (
    <Modal
      onClose={onClose}
      title="Add Institution"
      widthRem={28}
      footer={
        <>
          {create.isError && <p className="mr-auto self-center text-body-sm text-error">{create.error.message}</p>}
          <Button
            type="submit"
            form="institution-form"
            loading={create.isPending}
            disabled={!name.trim() || !city.trim()}
          >
            Add Institution
          </Button>
        </>
      }
    >
      <form id="institution-form" onSubmit={handleSubmit} className="flex flex-col gap-sm">
        <TextField label="Name" required value={name} onChange={(e) => setName(e.target.value)} />
        <TextField label="City" required value={city} onChange={(e) => setCity(e.target.value)} />
        <p className="text-caption text-text-secondary">
          The city is appended to the name automatically, so this saves as{' '}
          <strong>{name.trim() && city.trim() ? `${name.trim()} - ${city.trim()}` : 'Name - City'}</strong>. That is
          deliberate: &ldquo;The Choice School&rdquo; in Kochi and in Thiruvalla are separate schools, and a row whose
          name carries its city is unambiguous everywhere it appears. The same name in the same city is refused.
        </p>
        <TextField label="State" value={state} onChange={(e) => setState(e.target.value)} />
        <SelectField
          label="Type"
          id="institution-type"
          value={type}
          onChange={(e) => setType(e.target.value as 'school' | 'college')}
        >
          <option value="school">School</option>
          <option value="college">College</option>
        </SelectField>
      </form>
    </Modal>
  )
}

function SuggestionRow({ suggestion }: { suggestion: InstitutionSuggestion }) {
  const resolve = useResolveInstitutionSuggestion()
  const [creating, setCreating] = useState(false)
  const near = suggestion.near_matches ?? []

  return (
    <div className="flex flex-col gap-sm rounded-md border border-border bg-surface p-sm">
      <div className="flex flex-wrap items-baseline gap-xs">
        <span className="text-body text-text-primary">{suggestion.user_name}</span>
        <span className="text-body-sm text-text-secondary">typed</span>
        <span className="text-body text-text-primary">&ldquo;{suggestion.institution_raw}&rdquo;</span>
        {suggestion.institution_raw_city && (
          <span className="text-body-sm text-text-secondary">in {suggestion.institution_raw_city}</span>
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

      <div>
        <Button variant="secondary" onClick={() => setCreating(true)}>
          Create new institution
        </Button>
      </div>

      {resolve.isError && <p className="text-body-sm text-error">{resolve.error.message}</p>}

      {creating && (
        <CreateInstitutionModal
          initialName={suggestion.institution_raw}
          initialCity={suggestion.institution_raw_city ?? ''}
          onClose={() => setCreating(false)}
          onCreated={(created) => resolve.mutate({ userId: suggestion.user_id, institutionId: created.id })}
        />
      )}
    </div>
  )
}

export function InstitutionsPage() {
  const suggestions = useInstitutionSuggestions()
  const institutions = useInstitutions()
  const [adding, setAdding] = useState(false)

  const waiting = suggestions.data?.items ?? []

  const columns: TableColumn<Institution>[] = [
    { key: 'name', header: 'Institution', render: (i) => i.name },
    { key: 'city', header: 'City', render: (i) => i.city },
    { key: 'state', header: 'State', render: (i) => i.state ?? '—' },
    {
      key: 'type',
      header: 'Type',
      render: (i) => (
        <Badge color={i.type === 'school' ? 'primary' : 'secondary'}>{i.type === 'school' ? 'School' : 'College'}</Badge>
      ),
    },
  ]

  return (
    <AdminShell>
      <div className="flex flex-col gap-lg">
        <div className="flex items-start justify-between gap-md">
          <div>
            <h1 className="text-h1 text-text-primary">Institutions</h1>
            <p className="text-body-sm text-text-secondary">
              The Indian schools and colleges students come FROM — separate from Colleges &amp; Courses, which are
              destinations abroad. Students pick from this list; anything they type instead lands in the queue below.
            </p>
          </div>
          <Button onClick={() => setAdding(true)}>Add Institution</Button>
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
          {suggestions.isError && (
            <ErrorState message="Could not load the queue." onRetry={() => suggestions.refetch()} />
          )}
          {suggestions.data && waiting.length === 0 && (
            <p className="text-body-sm text-text-secondary">
              Nothing waiting — every student&rsquo;s school is resolved.
            </p>
          )}
          {waiting.map((s) => (
            <SuggestionRow key={s.user_id} suggestion={s} />
          ))}
        </section>

        <section className="flex flex-col gap-sm">
          <h2 className="text-h2 text-text-primary">All institutions</h2>
          {institutions.isLoading && <Skeleton className="h-40 rounded-lg" />}
          {institutions.isError && (
            <ErrorState message="Could not load institutions." onRetry={() => institutions.refetch()} />
          )}
          {institutions.data && <Table columns={columns} rows={institutions.data.items ?? []} rowKey={(i) => i.id} />}
        </section>
      </div>

      {adding && <CreateInstitutionModal onClose={() => setAdding(false)} />}
    </AdminShell>
  )
}
