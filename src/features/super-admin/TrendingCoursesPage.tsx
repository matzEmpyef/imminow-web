import { useEffect, useMemo, useState } from 'react'
import { ArrowDown, ArrowUp, Trash2 } from 'lucide-react'
import { AdminShell } from '@/features/auth/AdminShell'
import { Button } from '@/components/Button'
import { Badge } from '@/components/Badge'
import { TextField } from '@/components/TextField'
import { showToast } from '@/lib/toast'
import { useCourses } from '@/queries/courseSuggestions'
import { useSaveTrendingCourses, useTrendingCourses } from '@/queries/trendingCourses'

// Trending Courses (user, 2026-09-16: "I want to select few courses and show it as Trending
// Courses in mobile app. let admin decide the order"). The name students see is "Trending"; what
// this page holds is a hand-picked list, which is why nothing here claims to be based on views.
//
// Order is edited with Move up / Move down rather than drag-and-drop: a drag needs a mouse, and
// this list is at most ten rows, where two buttons are faster to use and work from the keyboard.
// Nothing saves until Save order is pressed, so a mis-click is undone by leaving the page.
export function TrendingCoursesPage() {
  const trending = useTrendingCourses()
  const save = useSaveTrendingCourses()
  const [search, setSearch] = useState('')
  const courses = useCourses({ search: search || undefined, active: true, limit: 20 })

  // The working copy. Seeded from the server and re-seeded whenever the server's own list
  // changes, so a save elsewhere is not silently overwritten by a stale draft.
  const [ids, setIds] = useState<string[]>([])
  const serverIds = useMemo(() => (trending.data?.items ?? []).map((i) => i.course_id!), [trending.data])
  useEffect(() => setIds(serverIds), [serverIds])

  const maxItems = trending.data?.max_items ?? 10
  const byId = useMemo(
    () => new Map((trending.data?.items ?? []).map((i) => [i.course_id!, i])),
    [trending.data],
  )
  // A course added in this session is not in the server's list yet, so its name comes from the
  // search results instead — without this the row renders as a bare id until the first save.
  const pickedById = useMemo(
    () => new Map((courses.data?.items ?? []).map((c) => [c.id!, c])),
    [courses.data],
  )

  const dirty = ids.join() !== serverIds.join()
  // Server-side search, not a filter over a fetched page: the catalogue is built for 10K+
  // colleges, so "the first 20 courses, filtered in the browser" would never find the one an
  // admin means. Results already in the rail are dropped from the list rather than shown
  // un-addable.
  const results = (courses.data?.items ?? []).filter((c) => !ids.includes(c.id!))

  function move(index: number, by: number) {
    const next = [...ids]
    const target = index + by
    if (target < 0 || target >= next.length) return
    ;[next[index], next[target]] = [next[target], next[index]]
    setIds(next)
  }

  function nameFor(id: string) {
    const row = byId.get(id)
    return row?.course?.name ?? pickedById.get(id)?.name ?? 'Unknown course'
  }

  function detailFor(id: string) {
    const course = byId.get(id)?.course ?? pickedById.get(id)
    return [course?.college_name, course?.level, course?.field_of_study].filter(Boolean).join(' · ')
  }

  return (
    <AdminShell>
      <div className="flex flex-col gap-lg">
        <div>
          <h1 className="text-h1 text-text-primary">Trending Courses</h1>
          <p className="text-body-sm text-text-secondary">
            The courses shown in the app's Trending Courses rail, in the order you set here. A
            student who has picked a field of interest sees courses in that field first; everyone
            else sees exactly this order.
          </p>
        </div>

        <div className="flex flex-col gap-sm rounded-md border border-border bg-surface p-md">
          <TextField
            id="add-course"
            label={`Add a course (${ids.length} of ${maxItems})`}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            disabled={ids.length >= maxItems}
            placeholder={
              ids.length >= maxItems ? `Remove one first — the rail holds ${maxItems}` : 'Search by course or college…'
            }
          />
          {search.trim().length > 0 && (
            <div className="max-h-64 overflow-y-auto rounded-md border border-border">
              {courses.isLoading ? (
                <p className="p-md text-body-sm text-text-secondary">Searching…</p>
              ) : results.length === 0 ? (
                <p className="p-md text-body-sm text-text-secondary">No courses match that.</p>
              ) : (
                <ul className="divide-y divide-border">
                  {results.map((course) => (
                    <li key={course.id} className="flex items-center gap-md p-sm">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-body-sm font-medium text-text-primary">{course.name}</p>
                        <p className="truncate text-caption text-text-secondary">
                          {[course.college_name, course.level, course.field_of_study].filter(Boolean).join(' · ')}
                        </p>
                      </div>
                      <Button
                        variant="secondary"
                        onClick={() => {
                          setIds([...ids, course.id!])
                          setSearch('')
                        }}
                      >
                        Add
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>

        {trending.isLoading ? (
          <p className="text-body-sm text-text-secondary">Loading…</p>
        ) : ids.length === 0 ? (
          <div className="rounded-md border border-dashed border-border p-lg text-center">
            <p className="text-body-sm text-text-secondary">
              No courses yet. The rail is hidden in the app until you add one.
            </p>
          </div>
        ) : (
          <ol className="flex flex-col divide-y divide-border rounded-md border border-border">
            {ids.map((id, index) => (
              <li key={id} className="flex items-center gap-md p-md">
                <span className="w-6 shrink-0 text-body-sm tabular-nums text-text-secondary">{index + 1}</span>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium text-text-primary">{nameFor(id)}</p>
                  <p className="truncate text-caption text-text-secondary">{detailFor(id) || '—'}</p>
                </div>
                {/* Says why a course stopped appearing, instead of the row quietly doing nothing. */}
                {byId.get(id)?.servable === false && <Badge color="secondary">Not shown — course is off</Badge>}
                <div className="flex shrink-0 items-center gap-xs">
                  <button
                    type="button"
                    onClick={() => move(index, -1)}
                    disabled={index === 0}
                    aria-label={`Move ${nameFor(id)} up`}
                    title="Move up"
                    className="flex h-9 w-9 items-center justify-center rounded-md text-text-secondary hover:bg-background hover:text-text-primary disabled:opacity-40"
                  >
                    <ArrowUp className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => move(index, 1)}
                    disabled={index === ids.length - 1}
                    aria-label={`Move ${nameFor(id)} down`}
                    title="Move down"
                    className="flex h-9 w-9 items-center justify-center rounded-md text-text-secondary hover:bg-background hover:text-text-primary disabled:opacity-40"
                  >
                    <ArrowDown className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setIds(ids.filter((x) => x !== id))}
                    aria-label={`Remove ${nameFor(id)}`}
                    title="Remove"
                    className="flex h-9 w-9 items-center justify-center rounded-md text-text-secondary hover:bg-background hover:text-error"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </li>
            ))}
          </ol>
        )}

        <div className="flex items-center gap-md">
          <Button
            loading={save.isPending}
            disabled={!dirty}
            onClick={() =>
              save.mutate(ids, {
                onSuccess: () => showToast(ids.length === 0 ? 'Trending Courses cleared' : 'Trending Courses saved'),
              })
            }
          >
            Save order
          </Button>
          {dirty && (
            <Button variant="secondary" onClick={() => setIds(serverIds)}>
              Discard changes
            </Button>
          )}
          {save.isError && <p className="text-body-sm text-error">{save.error.message}</p>}
          {!dirty && !save.isPending && <p className="text-body-sm text-text-secondary">Saved.</p>}
        </div>
      </div>
    </AdminShell>
  )
}
