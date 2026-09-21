import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/api/client'
import { useAuthStore } from '@/stores/authStore'
import { ApiError } from './auth'
import type { components } from '@/api/schema'

type JobListingInput = components['schemas']['JobListingInput']

export interface JobListFilters {
  search?: string
  /** live | scheduled | expired | off, comma-separated = any of. */
  status?: string
  jobType?: string
  workMode?: string
  category?: string
  /** Canonical country name(s) as `GET /jobs/locations` returns them, comma-separated = any of. */
  country?: string
  /** Canonical state / province name(s) within the chosen country, comma-separated = any of. */
  provinceState?: string
  sort?: string
  cursor?: string
  limit?: number
}

// Server-side search/filter/paging (2026-09-11) — this used to call GET /jobs with no params at
// all, so the admin only ever saw the first 20 of however many listings existed and could not
// find or edit the rest. Cursor-paged the same way every other admin list is.
export function useAdminJobs(filters: JobListFilters = {}) {
  const isAuthed = useAuthStore((s) => Boolean(s.accessToken))
  return useQuery({
    queryKey: ['admin-jobs', filters],
    queryFn: async () => {
      const filter: Record<string, string> = {}
      if (filters.jobType) filter.job_type = filters.jobType
      if (filters.workMode) filter.work_mode = filters.workMode
      if (filters.category) filter.category = filters.category
      // `filter[country]` / `filter[province_state]` REPLACE the old `filter[location]` (product
      // owner, 2026-09-20). `location` is a derived string now and is an unknown filter key the
      // server silently ignores, so sending it would look like a filter and do nothing.
      if (filters.country) filter.country = filters.country
      if (filters.provinceState) filter.province_state = filters.provinceState
      const { data, error } = await api.GET('/jobs', {
        params: {
          query: {
            search: filters.search || undefined,
            'filter[status]': filters.status || undefined,
            filter: Object.keys(filter).length > 0 ? filter : undefined,
            sort: filters.sort || undefined,
            cursor: filters.cursor,
            limit: filters.limit,
          },
        },
      })
      if (error) throw new ApiError('Could not load job listings.', error)
      return data
    },
    enabled: isAuthed,
  })
}

export interface JobLocationsQuery {
  /** Omitted for the country rung; a country name for that country's states / provinces. */
  country?: string
  /**
   * Which listings are counted (product owner, 2026-09-21). `live` — the default the server
   * applies when this is absent — is the student-facing answer. `all` counts every listing whatever
   * its status and needs the `jobs` platform permission.
   */
  scope?: 'live' | 'all'
  /**
   * Narrows `scope: 'all'` to the same comma-separated vocabulary `filter[status]` takes on the
   * list itself — `live,scheduled,expired,off`. Ignored without `scope: 'all'`; see below.
   */
  status?: string
}

/**
 * The places that actually HAVE listings, with a count each (product owner, 2026-09-20) — the
 * source for the Jobs list's Country and State/Province filters.
 *
 * Deliberately not a distinct-values scan of the loaded page, which is what a free-text location
 * forced: that only ever knew about the twenty rows currently on screen, so the options changed as
 * you paged and a country three pages down was unfilterable. It is also the point of the change —
 * "design a control for the data volume it will really hold": a picker must not offer two hundred
 * countries when four have jobs.
 *
 * One endpoint, two rungs: no `country` answers the countries, a country answers that country's
 * states / provinces. Rarely changes relative to a browsing session, so it caches like the other
 * reference lists (`useCountries`).
 *
 * `scope` AND `status` (product owner, 2026-09-21) are what make it usable by the people who
 * MAINTAIN the listings rather than only by the students who read them. The endpoint counted live
 * listings only, so a country whose listings had all expired appeared in no filter option at all
 * and the admin could not filter to rows that were plainly on the screen, while a province count
 * could disagree with what its own chip returned.
 *
 * `status` IS DROPPED unless `scope` is `all`, rather than passed through and refused. The server
 * answers 400 for the pair, correctly — a caller narrowing by status is asking about listings that
 * are not live, and answering the live-only question anyway would be a confident wrong number. But
 * that is a contract violation the console should not be able to commit by leaving one argument
 * behind during a refactor, so the impossible combination is not representable past this line.
 */
export function useJobLocations({ country, scope, status }: JobLocationsQuery = {}) {
  const isAuthed = useAuthStore((s) => Boolean(s.accessToken))
  const wantedStatus = scope === 'all' ? status || undefined : undefined
  return useQuery({
    queryKey: ['job-locations', country ?? null, scope ?? null, wantedStatus ?? null],
    queryFn: async () => {
      const query = { country: country || undefined, scope, status: wantedStatus }
      const { data, error } = await api.GET('/jobs/locations', {
        // Every key undefined is the same request the student's console makes — no `scope` at all,
        // which the server reads as `live`.
        params: { query: Object.values(query).some(Boolean) ? query : undefined },
      })
      if (error) throw new ApiError('Could not load the job locations list.', error)
      return data
    },
    enabled: isAuthed,
    staleTime: 5 * 60 * 1000,
  })
}

export function useCreateJob() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (body: JobListingInput) => {
      const { data, error } = await api.POST('/jobs', { body })
      if (error) throw new ApiError('Could not create this listing.', error)
      return data
    },
    onSuccess: () => invalidateJobLists(queryClient),
  })
}

export function useUpdateJob(id: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (body: Partial<JobListingInput>) => {
      const { data, error } = await api.PATCH('/jobs/{id}', { params: { path: { id } }, body })
      if (error) throw new ApiError('Could not update this listing.', error)
      return data
    },
    onSuccess: () => invalidateJobLists(queryClient),
  })
}

// A save can change which places have live listings — the first job in a country adds a filter
// option, switching the last one off takes it away, and so does an edit that only moves a job from
// one state to another. The counts move with them. So the locations list is invalidated alongside
// the list itself rather than being left to its staleTime, which would leave the filter offering a
// place that no longer has anything in it.
function invalidateJobLists(queryClient: ReturnType<typeof useQueryClient>) {
  queryClient.invalidateQueries({ queryKey: ['admin-jobs'] })
  queryClient.invalidateQueries({ queryKey: ['job-locations'] })
}
