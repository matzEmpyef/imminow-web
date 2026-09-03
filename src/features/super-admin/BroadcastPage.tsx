import { useState, type FormEvent } from 'react'
import { AdminShell } from '@/features/auth/AdminShell'
import { SelectField } from '@/components/SelectField'
import { Button } from '@/components/Button'
import { Badge } from '@/components/Badge'
import { TextField } from '@/components/TextField'
import {
  BROADCAST_CATEGORIES,
  BROADCAST_CATEGORY_LABELS,
  broadcastCategoryLabel,
  type BroadcastCategory,
} from '@/lib/broadcastCategories'
import { Table, type TableColumn } from '@/components/Table'
import { CompactSelect } from '@/components/CompactSelect'
import { Modal } from '@/components/Modal'
import { TargetingFilter } from '@/features/super-admin/TargetingFilter'
import { hasAnyTargeting } from '@/lib/targeting'
import { SearchSelect } from '@/components/SearchSelect'
import { useBlogArticles } from '@/queries/blogArticles'
import { useAdminEvents } from '@/queries/eventsAdmin'
import { useCountries } from '@/queries/countries'
import { useBroadcastHistory, useSendBroadcast } from '@/queries/broadcast'
import { useCursorPagination } from '@/lib/pagination'
import { formatDateTime } from '@/lib/time'
import type { components } from '@/api/schema'

type Audience = NonNullable<components['schemas']['BroadcastInput']['audience']>
type BroadcastTargeting = components['schemas']['Targeting']
type Broadcast = NonNullable<ReturnType<typeof useBroadcastHistory>['data']>['items'][number]

// The lifecycle presets are stored as days; read them back as the words the sender picked.
function describeDays(days: number): string {
  if (days === 14) return '2 weeks'
  if (days === 30) return 'a month'
  if (days === 90) return '3 months'
  return `${days} days`
}

// Renders a stored targeting object back as the sentence the sender meant. Send history is the
// only record of who a past broadcast went to, and "Filtered segment" on its own says nothing.
function describeSegment(targeting: Broadcast['targeting']): string {
  const t = targeting as BroadcastTargeting | null | undefined
  const parts: string[] = []
  if (t?.resident_country?.length) parts.push(`living in ${t.resident_country.join(', ')}`)
  if (t?.study_level?.length) parts.push(`studying ${t.study_level.join(', ')}`)
  if (t?.stage) parts.push(t.stage === 1 ? 'at lead stage' : 'at client stage')
  if (t?.joined_within_days) parts.push(`who joined in the last ${describeDays(t.joined_within_days)}`)
  if (t?.dormant_days) parts.push(`with no sign-in for ${describeDays(t.dormant_days)}`)
  return parts.length ? `Students ${parts.join(', ')}.` : 'Every student — no filters were set.'
}

const AUDIENCE_LABELS: Record<Audience, string> = {
  all_students: 'All students',
  segment: 'Filtered segment',
  all_staff: 'All immiNow staff',
}

// User-requested (2026-08-16) — "use popup to create a broadcast message instead of inline,"
// same sweep as every other "wherever there is add button, use popup" conversion this session.
// Was an inline Card rendered above the send history table; now a Modal opened by a header
// button, same shape.
function SendBroadcastModal({ onClose }: { onClose: () => void }) {
  const sendBroadcast = useSendBroadcast()
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [composeAudience, setComposeAudience] = useState<Audience>('all_students')
  const [category, setCategory] = useState<BroadcastCategory | ''>('')
  // Where tapping the notification takes the student. Until now every broadcast was a dead end,
  // so senders wrote "now available on the Blog tab" into the body and left the student to go find
  // it themselves.
  const [destination, setDestination] = useState('')
  const [targetId, setTargetId] = useState('')
  const needsArticle = destination === 'article'
  const needsEvent = destination === 'event'
  const articles = useBlogArticles()
  const events = useAdminEvents()
  const deepLink = needsArticle || needsEvent ? (targetId ? `/${destination}/${targetId}` : '') : destination
  const [targeting, setTargeting] = useState<BroadcastTargeting>({})
  const countries = useCountries()

  const isSegment = composeAudience === 'segment'
  const hasFilters = hasAnyTargeting(targeting)

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!title || !body || !category) return
    // Choosing "a specific article/event" and not picking one would send the same dead-end
    // notification this field exists to eliminate.
    if ((needsArticle || needsEvent) && !targetId) return
    // Targeting is sent only for `segment`; the other two audiences ignore it server-side, and
    // posting a stale object from a switched-away segment draft would be recorded as the
    // broadcast's segment in send history even though it filtered nothing.
    sendBroadcast.mutate(
      {
        title,
        body,
        audience: composeAudience,
        category,
        targeting: isSegment ? targeting : undefined,
        deep_link: deepLink || undefined,
      },
      { onSuccess: () => onClose() },
    )
  }

  return (
    <Modal
      onClose={onClose}
      title="Send Broadcast"
      // 28rem was sized for a title/body/category form. It now also hosts the full 11-field
      // targeting filter (2026-08-27), which cramped every control into a single narrow column.
      widthRem={46}
      footer={
        <>
          {sendBroadcast.isError && (
            <p className="mr-auto self-center text-body-sm text-error">{sendBroadcast.error.message}</p>
          )}
          <Button
            type="submit"
            form="broadcast-form"
            loading={sendBroadcast.isPending}
            disabled={!title || !body || !category || ((needsArticle || needsEvent) && !targetId)}
          >
            Send Broadcast
          </Button>
        </>
      }
    >
      <form id="broadcast-form" onSubmit={handleSubmit} className="flex flex-col gap-md">
        <TextField label="Title" value={title} onChange={(e) => setTitle(e.target.value)} />
        {/* Closed list as of 2026-08-27 (was a free-text box). It only labels the send history, so
            free text defeated its own purpose — the same value typed three ways filed three ways. */}
        <SelectField
          label="Category"
          id="broadcast-category"
          value={category}
          onChange={(e) => setCategory(e.target.value as BroadcastCategory | '')}
        >
          <option value="">Select…</option>
          {BROADCAST_CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {BROADCAST_CATEGORY_LABELS[c]}
            </option>
          ))}
        </SelectField>
        <SelectField
          label="Audience"
          id="audience"
          value={composeAudience}
          onChange={(e) => setComposeAudience(e.target.value as Audience)}
        >
          <option value="all_students">All students</option>
          <option value="segment">Filtered segment</option>
          <option value="all_staff">All immiNow staff</option>
        </SelectField>
        <SelectField
          label="Opens"
          id="destination"
          value={destination}
          onChange={(e) => {
            setDestination(e.target.value)
            setTargetId('')
          }}
        >
          <option value="">Nothing — informational only</option>
          <option value="article">A specific blog article</option>
          <option value="/blog">The Blog tab</option>
          <option value="event">A specific event</option>
          <option value="/events">The Events tab</option>
          <option value="/coupons">Coupons</option>
          <option value="/points">Sentpo Points</option>
          <option value="/jobs">Jobs</option>
          <option value="/plan">Their plan</option>
        </SelectField>
        {(needsArticle || needsEvent) && (
          <SearchSelect
            id="destination-target"
            options={
              needsArticle
                ? (articles.data?.items ?? []).map((x) => ({ id: x.id, label: x.title ?? '' }))
                : (events.data?.items ?? []).map((x) => ({ id: x.id!, label: x.title ?? '' }))
            }
            value={targetId}
            onChange={setTargetId}
            placeholder={needsArticle ? 'Search articles…' : 'Search events…'}
          />
        )}
        <p className="text-caption text-text-secondary">
          {destination
            ? 'Tapping the notification takes the student straight here.'
            : 'Tapping the notification will just mark it read.'}
        </p>
        {isSegment && (
          <div className="flex flex-col gap-sm rounded-md border border-border bg-background p-sm">
            <TargetingFilter
              lifecycle
              value={targeting}
              onChange={setTargeting}
              countries={countries.data ?? []}
              unknownDataPolicy="excludes"
            />
            {!hasFilters && (
              <p className="text-caption text-warning">
                No filters set — this would reach every student, the same as &ldquo;All students&rdquo;.
              </p>
            )}
          </div>
        )}
        <div className="flex flex-col gap-xs">
          <label className="text-body-sm font-medium text-text-primary" htmlFor="body">
            Body
          </label>
          <textarea
            id="body"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={4}
            className="w-full rounded-md border border-border bg-surface p-sm text-body outline-none focus:border-2 focus:border-primary"
          />
        </div>
      </form>
    </Modal>
  )
}

export function BroadcastPage() {
  const [sort, setSort] = useState<{ field: string; direction: 'asc' | 'desc' } | null>(null)
  const [search, setSearch] = useState('')
  const [audience, setAudience] = useState<Audience | ''>('')
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [showCompose, setShowCompose] = useState(false)
  const paging = useCursorPagination()

  const history = useBroadcastHistory({
    audience: audience || undefined,
    search: search || undefined,
    sort: sort ? (sort.direction === 'desc' ? `-${sort.field}` : sort.field) : undefined,
    cursor: paging.cursor,
    limit: 20,
  })

  function resetPaging() {
    paging.reset()
  }

  const columns: TableColumn<Broadcast>[] = [
    {
      key: 'title',
      header: 'Title',
      sortable: true,
      render: (b) => (
        <div className="flex items-center gap-sm">
          <span className="font-medium text-text-primary">{b.title}</span>
          <Badge color="primary">{AUDIENCE_LABELS[b.audience as Audience]}</Badge>
        </div>
      ),
    },
    {
      key: 'category',
      header: 'Category',
      sortable: true,
      render: (b) => <Badge color="secondary">{broadcastCategoryLabel(b.category)}</Badge>,
    },
    { key: 'recipient_count', header: 'Recipients', sortable: true, align: 'right', render: (b) => b.recipient_count },
    { key: 'sent_by_name', header: 'Sent By', render: (b) => b.sent_by_name },
    { key: 'created_at', header: 'Sent', sortable: true, render: (b) => formatDateTime(b.created_at) },
  ]

  return (
    <AdminShell>
      <div className="flex flex-col gap-lg">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-h1 text-text-primary">Broadcast</h1>
            <p className="text-body-sm text-text-secondary">
              Ad-hoc notification, sent to a chosen audience — respects each recipient's own opt-in.
            </p>
          </div>
          <Button onClick={() => setShowCompose(true)}>Send Broadcast</Button>
        </div>

        {showCompose && <SendBroadcastModal onClose={() => setShowCompose(false)} />}

        <div>
          <h2 className="mb-sm text-h3 text-text-primary">Send History</h2>
          <Table
            columns={columns}
            rows={history.data?.items ?? []}
            rowKey={(b) => b.id}
            loading={history.isLoading}
            error={history.isError ? 'Could not load broadcast history.' : undefined}
            emptyMessage="No broadcasts sent yet. Every broadcast you send appears here with its audience and reach."
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
              placeholder: 'Search title or category…',
            }}
            filters={
              <CompactSelect
                value={audience}
                onChange={(e) => {
                  setAudience(e.target.value as Audience | '')
                  resetPaging()
                }}
                label="Audience"
              >
                <option value="">Any audience</option>
                <option value="all_students">All students</option>
                <option value="segment">Filtered segment</option>
                <option value="all_staff">All immiNow staff</option>
              </CompactSelect>
            }
            pagination={{
              hasNext: Boolean(history.data?.meta.next_cursor),
              hasPrevious: paging.hasPrevious,
              onNext: () => history.data?.meta.next_cursor && paging.next(history.data.meta.next_cursor),
              onPrevious: paging.previous,
              total: history.data?.meta.total,
            }}
            expandable={{
              isExpanded: (b) => expandedId === b.id,
              renderExpanded: (b) => (
                <div className="flex flex-col gap-xs">
                  <p className="text-body-sm text-text-primary">{b.body}</p>
                  {b.audience === 'segment' && (
                    <p className="text-caption text-text-secondary">{describeSegment(b.targeting)}</p>
                  )}
                </div>
              ),
            }}
            onRowClick={(b) => setExpandedId((id) => (id === b.id ? null : b.id))}
          />
        </div>
      </div>
    </AdminShell>
  )
}
