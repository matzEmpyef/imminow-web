import { useMemo, useState, type FormEvent } from 'react'
import { AdminShell } from '@/features/auth/AdminShell'
import { Button } from '@/components/Button'
import { TextField } from '@/components/TextField'
import { Toggle } from '@/components/Toggle'
import { Badge } from '@/components/Badge'
import { Table, type TableColumn } from '@/components/Table'
import { Modal } from '@/components/Modal'
import { useBlogCategoryMappings, useUpdateMapping } from '@/queries/blogCategoryMappings'
import {
  useAddArticle,
  useBlogArticles,
  useRefreshArticle,
  useResolveArticle,
  useUpdateArticle,
} from '@/queries/blogArticles'
import { formatDate as formatDateShared } from '@/lib/time'
import type { components } from '@/api/schema'

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
  const [activeTab, setActiveTab] = useState<Tab>('Articles')

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
  const articles = useBlogArticles()
  const [showAdd, setShowAdd] = useState(false)
  const [search, setSearch] = useState('')
  // Newest first by default (user, 2026-08-23) — an editorial list is read in publication order,
  // and the API returns whatever order the store happens to hold.
  const [sort, setSort] = useState<{ field: string; direction: 'asc' | 'desc' }>({
    field: 'published_at',
    direction: 'desc',
  })
  const [page, setPage] = useState(0)
  const PAGE_SIZE = 20

  const rows = useMemo(() => {
    const items = [...(articles.data?.items ?? [])]
    const q = search.trim().toLowerCase()
    const filtered = q
      ? items.filter(
          (a) => a.title?.toLowerCase().includes(q) || a.tags?.some((t) => t.label.toLowerCase().includes(q)),
        )
      : items
    const direction = sort.direction === 'asc' ? 1 : -1
    return filtered.sort((a, b) => {
      if (sort.field === 'title') {
        return (a.title ?? '').localeCompare(b.title ?? '') * direction
      }
      // Missing dates sort last in BOTH directions rather than clumping at one end — an article
      // with no published_at is unplaceable on a date axis, not "oldest".
      const av = a.published_at ?? ''
      const bv = b.published_at ?? ''
      if (!av && !bv) return 0
      if (!av) return 1
      if (!bv) return -1
      return av.localeCompare(bv) * direction
    })
  }, [articles.data, search, sort])

  const pageCount = Math.max(1, Math.ceil(rows.length / PAGE_SIZE))
  // A filter or re-sort can strand the viewer past the end of the shorter result set.
  const safePage = Math.min(page, pageCount - 1)
  const pagedRows = rows.slice(safePage * PAGE_SIZE, safePage * PAGE_SIZE + PAGE_SIZE)

  const columns: TableColumn<BlogArticle>[] = [
    {
      key: 'title',
      header: 'Article',
      sortable: true,
      render: (a) => (
        <div className="flex items-center gap-sm">
          {a.thumbnail_url ? (
            <img src={a.thumbnail_url} alt="" className="h-10 w-14 shrink-0 rounded object-cover" />
          ) : (
            <div className="h-10 w-14 shrink-0 rounded bg-border" />
          )}
          <div className="min-w-0">
            <p className="truncate font-medium text-text-primary">{a.title}</p>
          </div>
        </div>
      ),
    },
    {
      key: 'tags',
      header: 'Tags',
      hideBelow: 'md',
      // Derived from the article's WordPress categories via Category Mapping — an admin never has
      // to set these, which is what keeps curation to a single field.
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
      key: 'published_at',
      header: 'Published',
      // The list's natural order (user, 2026-08-23) — defaults to newest first, see the sort
      // state above.
      sortable: true,
      render: (a) =>
        a.published_at ? formatDate(a.published_at) : <span className="text-body-sm text-text-secondary">—</span>,
    },
    { key: 'actions', header: '', align: 'right', render: (a) => <ArticleActions article={a} /> },
  ]

  return (
    <div className="flex flex-col gap-md">
      <div className="flex justify-end">
        <Button onClick={() => setShowAdd(true)}>Add Article</Button>
      </div>

      {showAdd && <AddArticleModal onClose={() => setShowAdd(false)} />}

      <Table
        columns={columns}
        rows={pagedRows}
        rowKey={(a) => a.id}
        loading={articles.isLoading}
        emptyMessage="No articles yet. Add one with its link from the Sentpo website."
        search={{ value: search, onChange: setSearch, placeholder: 'Search articles…' }}
        sort={sort}
        onSortChange={(field, direction) => {
          setSort({ field, direction })
          setPage(0)
        }}
        pagination={{
          hasNext: safePage < pageCount - 1,
          hasPrevious: safePage > 0,
          onNext: () => setPage(safePage + 1),
          onPrevious: () => setPage(safePage - 1),
          total: rows.length,
        }}
      />
    </div>
  )
}

// Row-level component so the mutation hooks can be called at a render top level — Table's
// `render: (row) => ...` runs as a callback, not a component body.
function ArticleActions({ article }: { article: BlogArticle }) {
  const updateArticle = useUpdateArticle()
  const refreshArticle = useRefreshArticle()
  const [error, setError] = useState<string | null>(null)

  return (
    <div className="flex items-center justify-end gap-sm">
      {error && <span className="text-body-sm text-error">{error}</span>}
      <Button
        variant="secondary"
        loading={refreshArticle.isPending}
        onClick={() => {
          setError(null)
          refreshArticle.mutate(article.id, { onError: (e) => setError(e.message) })
        }}
      >
        Refresh
      </Button>
      <Toggle
        checked={article.published_to_app !== false}
        onChange={(checked) => updateArticle.mutate({ id: article.id, published_to_app: checked })}
        label={`${article.title} visible in app`}
      />
    </div>
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
            onClick={() => addArticle.mutate({ source_url: url.trim() }, { onSuccess: onClose })}
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
                <img src={preview.thumbnail_url} alt="" className="h-24 w-32 shrink-0 rounded object-cover" />
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

  const rows = useMemo(() => {
    const items = mappings.data ?? []
    if (!search) return items
    const q = search.toLowerCase()
    return items.filter((m) => m.wp_category?.toLowerCase().includes(q) || m.app_tag?.toLowerCase().includes(q))
  }, [mappings.data, search])

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
            Rename
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
        emptyMessage="No category mappings yet."
        search={{ value: search, onChange: setSearch, placeholder: 'Search category or tag…' }}
      />
    </div>
  )
}

function RenameMappingModal({ mapping, onClose }: { mapping: BlogCategoryMapping; onClose: () => void }) {
  const updateMapping = useUpdateMapping(mapping.id!)
  const [label, setLabel] = useState(mapping.label ?? mapping.wp_category ?? '')
  const count = mapping.article_count ?? 0

  return (
    <Modal
      onClose={onClose}
      title="Rename Tag"
      widthRem={26}
      footer={
        <>
          {updateMapping.isError && (
            <p className="mr-auto self-center text-body-sm text-error">Could not rename this tag.</p>
          )}
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            loading={updateMapping.isPending}
            disabled={!label.trim() || label === mapping.label}
            onClick={() => updateMapping.mutate({ label: label.trim() }, { onSuccess: onClose })}
          >
            Rename
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
      </div>
    </Modal>
  )
}

function MappingToggle({ mapping }: { mapping: BlogCategoryMapping }) {
  const updateMapping = useUpdateMapping(mapping.id!)

  return (
    <div>
      <Toggle
        checked={Boolean(mapping.active)}
        onChange={(checked) => updateMapping.mutate({ active: checked })}
        label={`${mapping.wp_category} mapping active`}
      />
    </div>
  )
}
