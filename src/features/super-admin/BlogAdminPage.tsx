import { useMemo, useState, type FormEvent } from 'react'
import { useSearchParams } from 'react-router-dom'
import { ExternalLink } from 'lucide-react'
import { AdminShell } from '@/features/auth/AdminShell'
import { Button } from '@/components/Button'
import { TextField } from '@/components/TextField'
import { Toggle } from '@/components/Toggle'
import { Badge } from '@/components/Badge'
import { Table, type TableColumn } from '@/components/Table'
import { CompactSelect } from '@/components/CompactSelect'
import { FilterChip } from '@/components/FilterChip'
import { Modal } from '@/components/Modal'
import { useBlogCategoryMappings, useUpdateMapping } from '@/queries/blogCategoryMappings'
import {
  useAddArticle,
  useAdminBlogArticles,
  useRefreshArticle,
  useResolveArticle,
  useUpdateArticle,
  type BlogArticleListFilters,
} from '@/queries/blogArticles'
import { useCursorPagination } from '@/lib/pagination'
import { formatDate as formatDateShared, relativeTime } from '@/lib/time'
import { showToast } from '@/lib/toast'
import type { components } from '@/api/schema'
import { mediaUrl } from '@/lib/mediaUrl'

type BlogCategoryMapping = components['schemas']['BlogCategoryMapping']
type BlogArticle = components['schemas']['BlogArticle']

const TABS = ['Articles', 'Category Mapping'] as const
type Tab = (typeof TABS)[number]

// Wraps the platform's shared formatDate (dd/mm/yyyy) rather than a local `.toLocaleDateString()`
// re-implementation — this page's dates used to render in a different style (browser-locale-
// dependent) from the rest of the app.
const formatDate = (iso?: string) => (iso ? formatDateShared(iso) : '—')

/**
 * Blog admin (build reference 1.12/1.23).
 *
 * Content is authored on the Sentpo marketing WordPress site and never in-app. What lives here is
 * *curation* — which posts reach students, and what they're tagged as. Publishing on WordPress
 * does not put an article in the app; this page is the editorial gate, because the live site
 * carries 169 posts and only a fraction belong in a student's feed.
 */
export function BlogAdminPage() {
  // Needs attention's "Blog categories to review" card (?tab=mappings) lands on Category Mapping
  // instead of the Articles default; ?filter=new is read inside CategoryMappingTab itself.
  const [searchParams] = useSearchParams()
  const [activeTab, setActiveTab] = useState<Tab>(() => (searchParams.get('tab') === 'mappings' ? 'Category Mapping' : 'Articles'))

  return (
    <AdminShell>
      <div className="flex flex-col gap-lg">
        <div>
          <h1 className="text-h1 text-text-primary">Blog</h1>
          <p className="text-body-sm text-text-secondary">
            Articles are written on the Sentpo website. Add the ones that belong in the app — everything else fills
            itself in.
          </p>
        </div>

        <div className="flex gap-xs overflow-x-auto border-b border-border">
          {TABS.map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`shrink-0 border-b-2 px-md py-sm text-body-sm ${
                activeTab === tab ? 'border-primary font-medium text-primary' : 'border-transparent text-text-secondary'
              }`}
            >
              {tab}
            </button>
          ))}
        </div>

        {activeTab === 'Articles' ? <ArticlesTab /> : <CategoryMappingTab />}
      </div>
    </AdminShell>
  )
}

// --- Articles ---

function ArticlesTab() {
  const [showAdd, setShowAdd] = useState(false)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<NonNullable<BlogArticleListFilters['status']>>('all')
  const [tagFilter, setTagFilter] = useState('')
  const [tagsFor, setTagsFor] = useState<BlogArticle | null>(null)
  // Newest first by default (user, 2026-08-23) — an editorial list is read in publication order.
  // `published` is the server's sort field name for `published_at` (see mock-server's
  // `sortableFields` for GET /blog).
  // `published` is the only sortable field the contract declares for this list (2026-09-20), so
  // the state is narrowed to it rather than to any string — the Table's own sort callback hands
  // back a column key, and a key that is not sortable server-side would have gone out silently.
  const [sort, setSort] = useState<{ field: 'published'; direction: 'asc' | 'desc' }>({
    field: 'published',
    direction: 'desc',
  })
  const paging = useCursorPagination()
  const mappings = useBlogCategoryMappings()
  // An active mapping always HAS an `app_tag` — the server refuses to activate one without
  // (assumptions audit M4, product owner 2026-09-19) — but the field is nullable on the wire, so
  // the filter narrows on it rather than putting `value={null}` on an option.
  const activeMappings = useMemo(() => (mappings.data ?? []).filter((m) => m.active !== false), [mappings.data])
  const taggedMappings = useMemo(() => activeMappings.filter((m) => Boolean(m.app_tag)), [activeMappings])

  function resetPaging() {
    paging.reset()
  }

  // Reaches hidden articles and everything past the first page (2026-09-11) — the admin used to
  // call the student feed (published only, 20 rows), so a hidden article vanished from here too
  // and could never be brought back, and anything past #20 was unreachable.
  const articles = useAdminBlogArticles({
    search: search || undefined,
    status: statusFilter,
    tag: tagFilter || undefined,
    sort: sort.direction === 'desc' ? ('-published' as const) : ('published' as const),
    cursor: paging.cursor,
    limit: 20,
  })

  const rows = articles.data?.items ?? []

  const columns: TableColumn<BlogArticle>[] = [
    {
      key: 'title',
      header: 'Article',
      render: (a) => (
        <div className="flex items-center gap-sm">
          {a.thumbnail_url ? (
            <img src={mediaUrl(a.thumbnail_url)} alt="" className="h-10 w-14 shrink-0 rounded object-cover" />
          ) : (
            <div className="h-10 w-14 shrink-0 rounded bg-border" />
          )}
          {/* Capped and clamped to two lines (2026-09-11): `truncate` never engaged inside an
              auto-width table cell, so a long title stretched the table past its card and pushed
              Tags / Refresh / the switch off-screen at 1280px. */}
          <div className="min-w-0" style={{ maxWidth: '26rem' }}>
            <div className="flex items-center gap-xs">
              <p
                className="font-medium text-text-primary"
                title={a.title}
                style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}
              >
                {a.title}
              </p>
              {a.published_to_app === false && <Badge color="secondary">Hidden</Badge>}
            </div>
            <div className="flex flex-wrap items-center gap-sm text-caption text-text-secondary">
              {a.source_url && (
                <a
                  href={a.source_url}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-xs text-primary hover:underline"
                >
                  Open on website
                  <ExternalLink className="h-3 w-3" />
                </a>
              )}
              {a.cached_at && <span>Last refreshed {relativeTime(a.cached_at)}</span>}
            </div>
          </div>
        </div>
      ),
    },
    {
      key: 'tags',
      header: 'Tags',
      hideBelow: 'md',
      // Derived from the article's WordPress categories via Category Mapping unless overridden by
      // hand — an admin never has to set these for the normal path, which is what keeps curation
      // to a single field.
      render: (a) =>
        a.tags?.length ? (
          <div className="flex flex-wrap gap-xs">
            {a.tags.map((t) => (
              <Badge key={t.id} color="info">
                {t.label}
              </Badge>
            ))}
          </div>
        ) : (
          <span className="text-body-sm text-text-secondary">Untagged</span>
        ),
    },
    {
      key: 'published',
      header: 'Published',
      // The list's natural order (user, 2026-08-23) — defaults to newest first, see the sort
      // state above.
      sortable: true,
      render: (a) =>
        a.published_at ? formatDate(a.published_at) : <span className="text-body-sm text-text-secondary">—</span>,
    },
    { key: 'actions', header: '', align: 'right', render: (a) => <ArticleActions article={a} onEditTags={() => setTagsFor(a)} /> },
  ]

  return (
    <div className="flex flex-col gap-md">
      <div className="flex justify-end">
        <Button onClick={() => setShowAdd(true)}>Add Article</Button>
      </div>

      {showAdd && <AddArticleModal onClose={() => setShowAdd(false)} />}
      {tagsFor && <TagsEditorModal article={tagsFor} mappings={activeMappings} onClose={() => setTagsFor(null)} />}

      <Table
        columns={columns}
        rows={rows}
        rowKey={(a) => a.id}
        loading={articles.isLoading}
        error={articles.isError ? 'Could not load articles.' : undefined}
        emptyMessage={
          search || tagFilter || statusFilter !== 'all'
            ? 'No articles match these filters.'
            : 'No articles yet. Add one with its link from the Sentpo website.'
        }
        search={{
          value: search,
          onChange: (value) => {
            setSearch(value)
            resetPaging()
          },
          placeholder: 'Search articles…',
        }}
        filters={
          <>
            <CompactSelect
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value as NonNullable<BlogArticleListFilters['status']>)
                resetPaging()
              }}
              label="Status"
            >
              <option value="all">All</option>
              <option value="published">Published</option>
              <option value="hidden">Hidden</option>
            </CompactSelect>
            <CompactSelect
              value={tagFilter}
              onChange={(e) => {
                setTagFilter(e.target.value)
                resetPaging()
              }}
              label="Tag"
            >
              <option value="">Any tag</option>
              {taggedMappings.map((m) => (
                <option key={m.id} value={m.app_tag!}>
                  {m.label ?? m.wp_category}
                </option>
              ))}
            </CompactSelect>
          </>
        }
        sort={sort}
        onSortChange={(field, direction) => {
          if (field !== 'published') return
          setSort({ field, direction })
          resetPaging()
        }}
        pagination={{
          hasNext: Boolean(articles.data?.meta?.next_cursor),
          hasPrevious: paging.hasPrevious,
          onNext: () => articles.data?.meta?.next_cursor && paging.next(articles.data.meta.next_cursor),
          onPrevious: paging.previous,
          total: articles.data?.meta?.total,
        }}
      />
    </div>
  )
}

// Row-level component so the mutation hooks can be called at a render top level — Table's
// `render: (row) => ...` runs as a callback, not a component body.
function ArticleActions({ article, onEditTags }: { article: BlogArticle; onEditTags: () => void }) {
  const updateArticle = useUpdateArticle()
  const refreshArticle = useRefreshArticle()
  const [error, setError] = useState<string | null>(null)

  return (
    <div className="flex flex-col items-end gap-xs">
      {error && <span className="text-body-sm text-error">{error}</span>}
      <div className="flex items-center gap-sm">
        <Button size="sm" variant="secondary" onClick={onEditTags}>
          Tags
        </Button>
        <Button
          size="sm"
          variant="secondary"
          loading={refreshArticle.isPending}
          onClick={() => {
            setError(null)
            refreshArticle.mutate(article.id, {
              onSuccess: () => showToast(`${article.title} refreshed`),
              onError: (e) => setError(e.message),
            })
          }}
        >
          Refresh
        </Button>
        <Toggle
          size="sm"
          checked={article.published_to_app !== false}
          onChange={(checked) => {
            // Used to fail silently (Marketing review, 2026-09-11) — no onError meant a rejected
            // toggle just snapped back with nothing to say why.
            setError(null)
            updateArticle.mutate({ id: article.id, published_to_app: checked }, { onError: (e) => setError(e.message) })
          }}
          label={`${article.title} visible in app`}
        />
      </div>
    </div>
  )
}

/**
 * Per-article tags editor (2026-09-11).
 *
 * Tags normally follow the WordPress category via Category Mapping — an admin never has to touch
 * this. This is the override for the exception: pick from the active tags by hand, or press "Use
 * website categories" to drop the override and go back to following WordPress (`category_ids:
 * null`, server-side — see useUpdateArticle).
 */
function TagsEditorModal({
  article,
  mappings,
  onClose,
}: {
  article: BlogArticle
  mappings: BlogCategoryMapping[]
  onClose: () => void
}) {
  const updateArticle = useUpdateArticle()
  const [selected, setSelected] = useState<string[]>(article.tags?.map((t) => t.id) ?? [])

  function toggle(id: string) {
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))
  }

  return (
    <Modal
      onClose={onClose}
      title="Edit Tags"
      widthRem={28}
      footer={
        <>
          {updateArticle.isError && <p className="mr-auto self-center text-body-sm text-error">{updateArticle.error.message}</p>}
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            loading={updateArticle.isPending}
            onClick={() =>
              updateArticle.mutate(
                { id: article.id, category_ids: selected },
                {
                  onSuccess: () => {
                    onClose()
                    showToast('Tags saved')
                  },
                },
              )
            }
          >
            Save Tags
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-md">
        <div className="flex items-center justify-between gap-sm">
          <p className="text-body-sm text-text-secondary">
            {article.tags_overridden
              ? "These tags were set by hand — they won't follow the website's own categories anymore."
              : "Following the website's own categories. Pick tags below to override them."}
          </p>
          {article.tags_overridden && <Badge color="info">Set by hand</Badge>}
        </div>
        <div className="flex max-h-72 flex-col gap-xs overflow-y-auto rounded-md border border-border p-sm">
          {mappings.length === 0 && <p className="text-body-sm text-text-secondary">No active tags in Category Mapping.</p>}
          {mappings.map((m) => (
            <label key={m.id} className="flex items-center gap-sm text-body-sm text-text-primary">
              <input
                type="checkbox"
                checked={selected.includes(m.id!)}
                onChange={() => toggle(m.id!)}
                className="h-4 w-4"
              />
              {m.label ?? m.wp_category}
            </label>
          ))}
        </div>
        <Button
          variant="secondary"
          loading={updateArticle.isPending}
          onClick={() =>
            updateArticle.mutate(
              { id: article.id, category_ids: null },
              {
                onSuccess: () => {
                  onClose()
                  showToast('Tags reset to website categories')
                },
              },
            )
          }
        >
          Use Website Categories
        </Button>
      </div>
    </Modal>
  )
}

/**
 * Add Article — one field.
 *
 * Paste the URL, press Fetch, and the backend resolves the slug against the WordPress REST API and
 * fills in title, date, excerpt, thumbnail, tags and body. What the admin does here is *confirm*,
 * not type. The preview shows the rendered body deliberately: this is the only moment a mangled
 * table or a stripped-to-nothing article can be caught before students see it.
 */
function AddArticleModal({ onClose }: { onClose: () => void }) {
  const [url, setUrl] = useState('')
  const resolve = useResolveArticle()
  const addArticle = useAddArticle()
  const preview = resolve.data

  function handleFetch(e: FormEvent) {
    e.preventDefault()
    if (!url.trim()) return
    resolve.mutate(url.trim())
  }

  return (
    <Modal
      onClose={onClose}
      title="Add Article"
      widthRem={44}
      footer={
        <>
          {addArticle.isError && (
            <p className="mr-auto self-center text-body-sm text-error">{addArticle.error.message}</p>
          )}
          {preview?.already_curated && (
            <p className="mr-auto self-center text-body-sm text-text-secondary">This article is already in the app.</p>
          )}
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            loading={addArticle.isPending}
            disabled={!preview || preview.already_curated}
            onClick={() =>
              addArticle.mutate(
                { source_url: url.trim() },
                {
                  onSuccess: () => {
                    onClose()
                    showToast(`${preview?.title ?? 'Article'} published`)
                  },
                },
              )
            }
          >
            Publish to App
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-md">
        <form onSubmit={handleFetch} className="flex items-end gap-sm">
          <div className="flex-1">
            <TextField
              label="Article link"
              placeholder="https://sentpo.com/…"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
            />
          </div>
          <Button type="submit" variant="secondary" loading={resolve.isPending} disabled={!url.trim()}>
            Fetch
          </Button>
        </form>

        {resolve.isError && <p className="text-body-sm text-error">{resolve.error.message}</p>}

        {preview && (
          <div className="flex flex-col gap-md rounded-lg border border-border p-md">
            <div className="flex gap-md">
              {preview.thumbnail_url && (
                <img src={mediaUrl(preview.thumbnail_url)} alt="" className="h-24 w-32 shrink-0 rounded object-cover" />
              )}
              <div className="min-w-0 flex-1">
                <p className="font-medium text-text-primary">{preview.title}</p>
                <p className="mt-xs text-body-sm text-text-secondary">{formatDate(preview.published_at)}</p>
                <div className="mt-xs flex flex-wrap gap-xs">
                  {preview.tags?.length ? (
                    preview.tags.map((t) => (
                      <Badge key={t.id} color="info">
                        {t.label}
                      </Badge>
                    ))
                  ) : (
                    <span className="text-body-sm text-warning">
                      No tag — this article's category isn't mapped yet.
                    </span>
                  )}
                </div>
              </div>
            </div>

            <div>
              <p className="mb-xs text-body-sm font-medium text-text-primary">
                Preview — this is what students will read
              </p>
              <div
                className="prose-preview max-h-72 overflow-y-auto rounded border border-border bg-surface p-md text-body-sm text-text-primary"
                // Server-sanitised to a fixed allowlist (h2–h4, p, strong, em, a, lists, tables,
                // img, br) with all style/class attributes and any script stripped, and href/src
                // restricted to http(s). See mock-server/lib/articleContent.js.
                dangerouslySetInnerHTML={{ __html: preview.content ?? '' }}
              />
            </div>
          </div>
        )}
      </div>
    </Modal>
  )
}

// --- Category Mapping ---

/**
 * The only place a tag's display name exists.
 *
 * Articles reference a mapping by id, so renaming one here updates every article at once with
 * nothing to re-fetch and no cached content to invalidate. `article_count` is shown next to each
 * row so an admin can see what a rename or a deactivation is about to affect before doing it.
 */
function CategoryMappingTab() {
  const mappings = useBlogCategoryMappings()
  const [search, setSearch] = useState('')
  const [editing, setEditing] = useState<BlogCategoryMapping | null>(null)
  const [searchParams] = useSearchParams()
  // Needs attention's "Blog categories to review" card (?filter=new) — new-from-website mappings
  // waiting to be named and activated, same rule the card itself counts by.
  const [newOnly, setNewOnly] = useState(() => searchParams.get('filter') === 'new')

  const rows = useMemo(() => {
    let items = mappings.data ?? []
    if (newOnly) items = items.filter((m) => m.auto_added && !m.active)
    if (!search) return items
    const q = search.toLowerCase()
    return items.filter(
      (m) =>
        m.wp_category?.toLowerCase().includes(q) ||
        m.app_tag?.toLowerCase().includes(q) ||
        m.suggested_app_tag?.toLowerCase().includes(q),
    )
  }, [mappings.data, search, newOnly])
  const newCount = useMemo(() => (mappings.data ?? []).filter((m) => m.auto_added && !m.active).length, [mappings.data])

  const columns: TableColumn<BlogCategoryMapping>[] = [
    {
      key: 'wp_category',
      header: 'Website category',
      render: (m) => (
        <span className="flex items-center gap-sm text-text-secondary">
          {m.wp_category}
          {m.auto_added && !m.active && <Badge color="info">New from website</Badge>}
        </span>
      ),
    },
    {
      key: 'label',
      header: 'Shows in app as',
      render: (m) => <span className="font-medium text-text-primary">{m.label ?? m.wp_category}</span>,
    },
    {
      // THE ADMIN'S ANSWER, not the website's slug (assumptions audit M4, product owner
      // 2026-09-19). It used to be taken from WordPress, so renaming a category on the marketing
      // site minted a NEW tag and every student following the old one silently stopped matching
      // anything. Shown in the list because it is what `blog_topics` are stored as — a tag nobody
      // can see is a tag nobody notices going wrong.
      key: 'app_tag',
      header: 'Tag students follow',
      hideBelow: 'md',
      render: (m) =>
        m.app_tag ? (
          <code className="text-body-sm text-text-secondary">{m.app_tag}</code>
        ) : (
          <span className="text-body-sm text-text-secondary">Not set yet</span>
        ),
    },
    {
      key: 'article_count',
      header: 'Articles',
      align: 'right',
      hideBelow: 'sm',
      render: (m) => <span className="text-text-secondary">{m.article_count ?? 0}</span>,
    },
    {
      key: 'actions',
      header: '',
      align: 'right',
      render: (m) => (
        <div className="flex items-center justify-end gap-sm">
          <Button variant="secondary" onClick={() => setEditing(m)}>
            Edit
          </Button>
          <MappingToggle mapping={m} />
        </div>
      ),
    },
  ]

  return (
    <div className="flex flex-col gap-md">
      <p className="text-body-sm text-text-secondary">
        Each website category becomes a tag students filter by. Renaming one here updates every article instantly.
      </p>

      {editing && <RenameMappingModal mapping={editing} onClose={() => setEditing(null)} />}

      <Table
        columns={columns}
        rows={rows}
        rowKey={(m) => m.id!}
        loading={mappings.isLoading}
        error={mappings.isError ? 'Could not load category mappings.' : undefined}
        emptyMessage={newOnly ? 'No new website categories waiting.' : 'No category mappings yet.'}
        search={{ value: search, onChange: setSearch, placeholder: 'Search category or tag…' }}
        quickFilters={
          newCount > 0 && <FilterChip label={`New from website (${newCount})`} active={newOnly} onChange={setNewOnly} />
        }
      />
    </div>
  )
}

/**
 * The message the server sends when an activation carries no tag, said client-side first
 * (assumptions audit M4, product owner 2026-09-19). Worded identically on purpose: an admin who
 * meets it in both places should not have to work out whether they are two different rules.
 */
const NO_TAG_MESSAGE = 'Give this category an in-app tag before switching it on — it is what students follow.'

/** What the website would have called it — a SUGGESTION, never the stored answer (M4). */
const suggestedTagFor = (mapping: BlogCategoryMapping) => mapping.suggested_app_tag ?? ''

function RenameMappingModal({ mapping, onClose }: { mapping: BlogCategoryMapping; onClose: () => void }) {
  const updateMapping = useUpdateMapping(mapping.id!)
  const [label, setLabel] = useState(mapping.label ?? mapping.wp_category ?? '')
  // The tag is only editable while it has never been set. Once students follow it, changing it
  // orphans every one of them — the contract says as much — so after that it is shown, not edited.
  const [appTag, setAppTag] = useState(mapping.app_tag ?? suggestedTagFor(mapping))
  const tagLocked = Boolean(mapping.app_tag)
  const count = mapping.article_count ?? 0

  return (
    <Modal
      onClose={onClose}
      title="Edit Tag"
      widthRem={28}
      footer={
        <>
          {updateMapping.isError && (
            <p className="mr-auto self-center text-body-sm text-error">{updateMapping.error.message}</p>
          )}
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            loading={updateMapping.isPending}
            disabled={
              !label.trim() ||
              (label.trim() === (mapping.label ?? '') && (tagLocked || appTag.trim() === (mapping.app_tag ?? '')))
            }
            onClick={() =>
              updateMapping.mutate(
                {
                  label: label.trim(),
                  // Only ever sent while the tag has never been set (M4) — an edit here would
                  // orphan every student already following it.
                  ...(tagLocked || !appTag.trim() ? {} : { app_tag: appTag.trim() }),
                },
                {
                  onSuccess: () => {
                    onClose()
                    showToast(`Saved \u201C${label.trim()}\u201D`)
                  },
                },
              )
            }
          >
            Save
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-md">
        <TextField label="Shows in app as" value={label} onChange={(e) => setLabel(e.target.value)} />
        <p className="text-body-sm text-text-secondary">
          {count === 0
            ? 'No articles carry this tag yet.'
            : `${count} article${count === 1 ? '' : 's'} will show the new name straight away.`}
        </p>
        {tagLocked ? (
          <div className="flex flex-col gap-xs rounded-md border border-border bg-background p-sm">
            <p className="text-caption text-text-secondary">Tag students follow</p>
            <code className="text-body-sm text-text-primary">{mapping.app_tag}</code>
            <p className="text-caption text-text-secondary">
              Fixed once set — students&rsquo; followed topics are stored as this exact value, so changing it would
              silently unsubscribe every one of them. Rename the display name above instead.
            </p>
          </div>
        ) : (
          <>
            <TextField
              label="Tag students follow"
              value={appTag}
              onChange={(e) => setAppTag(e.target.value)}
              placeholder="e.g. study-abroad"
            />
            <p className="text-caption text-text-secondary">
              {suggestedTagFor(mapping)
                ? `The website calls this \u201C${suggestedTagFor(mapping)}\u201D — a suggestion only. `
                : ''}
              Set once and then fixed: it is the value students&rsquo; followed topics are stored as, so a later change
              would unsubscribe everyone following it.
            </p>
          </>
        )}
      </div>
    </Modal>
  )
}

/**
 * Activation asks for the tag (assumptions audit M4, product owner 2026-09-19).
 *
 * The server refuses `{ active: true }` on a mapping with no `app_tag` — activating one would
 * publish articles under a topic nobody can subscribe to — so rather than letting the admin meet
 * that 400, the switch opens this and asks. The WordPress slug is offered as a starting point and
 * nothing more; it is never re-applied when the website renames the category, which is the defect
 * the audit caught.
 */
function ActivateMappingModal({ mapping, onClose }: { mapping: BlogCategoryMapping; onClose: () => void }) {
  const updateMapping = useUpdateMapping(mapping.id!)
  const [appTag, setAppTag] = useState(suggestedTagFor(mapping))
  const suggestion = suggestedTagFor(mapping)
  const label = mapping.label ?? mapping.wp_category

  return (
    <Modal
      onClose={onClose}
      title="Turn On This Tag"
      widthRem={28}
      footer={
        <>
          {updateMapping.isError && (
            <p className="mr-auto self-center text-body-sm text-error">{updateMapping.error.message}</p>
          )}
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            loading={updateMapping.isPending}
            disabled={!appTag.trim()}
            onClick={() =>
              updateMapping.mutate(
                { app_tag: appTag.trim(), active: true },
                {
                  onSuccess: () => {
                    onClose()
                    showToast(`${label} tag turned on`)
                  },
                },
              )
            }
          >
            Turn On
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-md">
        <p className="text-body-sm text-text-secondary">{NO_TAG_MESSAGE}</p>
        <TextField
          label="Tag students follow"
          value={appTag}
          onChange={(e) => setAppTag(e.target.value)}
          placeholder="e.g. study-abroad"
        />
        <p className="text-caption text-text-secondary">
          {suggestion
            ? `The website calls this \u201C${suggestion}\u201D. That is a suggestion — it is not kept in step, and a rename on the website never changes what you set here.`
            : 'The website has no slug for this category, so there is nothing to suggest.'}
        </p>
      </div>
    </Modal>
  )
}

// Turning a tag off asks first (2026-09-11) — same "confirm before a change that removes
// something" rule Rename's article count already hints at, made explicit: every article carrying
// this tag loses it the moment the mapping is deactivated (GET /blog only resolves tags from
// `active !== false` mappings). Turning one back on needs no confirmation — nothing is lost.
function MappingToggle({ mapping }: { mapping: BlogCategoryMapping }) {
  const updateMapping = useUpdateMapping(mapping.id!)
  const [confirming, setConfirming] = useState(false)
  // Turning one ON with no tag yet asks for the tag first (assumptions audit M4, product owner
  // 2026-09-19) rather than sending a request the server refuses 400.
  const [naming, setNaming] = useState(false)
  const count = mapping.article_count ?? 0
  const label = mapping.label ?? mapping.wp_category

  return (
    <>
      <Toggle
        size="sm"
        checked={Boolean(mapping.active)}
        onChange={(checked) => {
          if (!checked) {
            setConfirming(true)
            return
          }
          if (!mapping.app_tag) {
            setNaming(true)
            return
          }
          updateMapping.mutate({ active: true })
        }}
        label={`${mapping.wp_category} mapping active`}
      />
      {naming && <ActivateMappingModal mapping={mapping} onClose={() => setNaming(false)} />}
      {confirming && (
        <Modal
          onClose={() => setConfirming(false)}
          title="Turn Off This Tag"
          widthRem={26}
          footer={
            <>
              {updateMapping.isError && (
                <p className="mr-auto self-center text-body-sm text-error">Could not update this mapping.</p>
              )}
              <Button variant="secondary" onClick={() => setConfirming(false)}>
                Cancel
              </Button>
              <Button
                variant="destructive"
                loading={updateMapping.isPending}
                onClick={() =>
                  updateMapping.mutate(
                    { active: false },
                    {
                      onSuccess: () => {
                        setConfirming(false)
                        showToast(`${label} tag turned off`)
                      },
                    },
                  )
                }
              >
                Turn Off
              </Button>
            </>
          }
        >
          <p className="text-body-sm text-text-secondary">
            {count === 0
              ? `No articles carry "${label}" yet — turning it off is safe.`
              : `${count} article${count === 1 ? '' : 's'} will lose the "${label}" tag.`}
          </p>
        </Modal>
      )}
    </>
  )
}
