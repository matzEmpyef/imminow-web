import { api } from '@/api/client'
import type { components } from '@/api/schema'
import type { ServerSearchSource } from '@/lib/useServerSearch'
import { ApiError } from './auth'

// The lists the server-searched pickers read (review F-038): each sends what is typed as the
// route's own search parameter and pages with its cursor, so a record is reachable however far
// down the list it sits. One source per list, so every picker over it asks the same way. Keys
// live under 'picker', apart from the screens' own list keys: a write that refreshes a list
// should not also refetch every page a picker happens to hold.

export type Client = components['schemas']['Client']
export type Lead = components['schemas']['Lead']
export type Course = components['schemas']['Course']
export type College = components['schemas']['College']
export type Consultancy = components['schemas']['Consultancy']
export type Institution = components['schemas']['Institution']

const PAGE = 30

export const clientName = (c: Client) => `${c.student.first_name} ${c.student.last_name}`

async function fetchClientPage(search: string, cursor: string | undefined, signal: AbortSignal) {
  const { data, error } = await api.GET('/clients', {
    params: { query: { search: search || undefined, cursor, limit: PAGE } },
    signal,
  })
  if (error) throw new ApiError('Could not load clients.', error)
  return data
}

/** The consultancy's own applicants (`GET /clients`, `search`). */
export const clientSource: ServerSearchSource<Client> = {
  queryKey: ['picker', 'clients'],
  fetchPage: async ({ search, cursor, signal }) => {
    const data = await fetchClientPage(search, cursor, signal)
    return { items: data.items, nextCursor: data.meta.next_cursor }
  },
  fetchById: async (id, signal) => {
    const { data, error } = await api.GET('/clients/{id}', { params: { path: { id } }, signal })
    if (error) throw new ApiError('Could not load this client.', error)
    return data ?? null
  },
  toOption: (c) => ({ id: c.id, label: clientName(c) }),
}

export type PersonRow = { kind: 'client'; client: Client } | { kind: 'lead'; lead: Lead }

/**
 * Applicants and leads in one list (Course Finder, Assign Task): student cases only, and leads
 * that are active and allocated — the rules `usePersonPicker` applied to its two capped pages.
 * The two lists page independently, so the cursor carries one position for each (`null` once a
 * list has ended); applicants come first on every page, as they did.
 */
export const personSource: ServerSearchSource<PersonRow> = {
  queryKey: ['picker', 'people'],
  fetchPage: async ({ search, cursor, signal }) => {
    const at = cursor ? (JSON.parse(cursor) as { c: string | null; l: string | null }) : undefined
    const [clients, leads] = await Promise.all([
      at?.c === null ? null : fetchClientPage(search, at?.c, signal),
      at?.l === null
        ? null
        : api
            .GET('/leads', {
              params: {
                query: {
                  filter: { show_closed: 'false', unallocated: 'false' },
                  search: search || undefined,
                  cursor: at?.l,
                  limit: PAGE,
                },
              },
              signal,
            })
            .then(({ data, error }) => {
              if (error) throw new ApiError('Could not load leads.', error)
              return data
            }),
    ])
    const next = { c: clients?.meta.next_cursor ?? null, l: leads?.meta.next_cursor ?? null }
    return {
      items: [
        ...(clients?.items ?? [])
          .filter((c) => c.case_type === 'student')
          .map((client): PersonRow => ({ kind: 'client', client })),
        ...(leads?.items ?? []).filter((l) => l.status === 'active').map((lead): PersonRow => ({ kind: 'lead', lead })),
      ],
      nextCursor: next.c || next.l ? JSON.stringify(next) : null,
    }
  },
  toOption: (p) =>
    p.kind === 'client'
      ? { id: p.client.id, label: clientName(p.client), group: 'Applicant' }
      : { id: p.lead.id, label: p.lead.name, group: 'Lead' },
}

/** The course catalogue (`GET /courses`, `search`), optionally the courses of one college. */
export function courseSource(collegeId?: string): ServerSearchSource<Course> {
  return {
    queryKey: ['picker', 'courses', collegeId ?? ''],
    fetchPage: async ({ search, cursor, signal }) => {
      const { data, error } = await api.GET('/courses', {
        params: {
          query: {
            search: search || undefined,
            filter: collegeId ? { college_id: collegeId } : undefined,
            cursor,
            limit: PAGE,
          },
        },
        signal,
      })
      if (error) throw new ApiError('Could not load courses.', error)
      return { items: data.items, nextCursor: data.meta.next_cursor }
    },
    fetchById: async (id, signal) => {
      const { data, error } = await api.GET('/courses/{id}', { params: { path: { id } }, signal })
      if (error) throw new ApiError('Could not load that course.', error)
      return data ?? null
    },
    toOption: (c) => ({
      id: c.id,
      label: c.name,
      sublabel: c.college_name + (c.country ? ` · ${c.country}` : ''),
    }),
  }
}

/** The college catalogue (`GET /colleges`, `search`). */
export const collegeSource: ServerSearchSource<College> = {
  queryKey: ['picker', 'colleges'],
  fetchPage: async ({ search, cursor, signal }) => {
    const { data, error } = await api.GET('/colleges', {
      params: { query: { search: search || undefined, cursor, limit: PAGE } },
      signal,
    })
    if (error) throw new ApiError('Could not load colleges.', error)
    return { items: data.items, nextCursor: data.meta.next_cursor }
  },
  fetchById: async (id, signal) => {
    const { data, error } = await api.GET('/colleges/{id}', { params: { path: { id } }, signal })
    if (error) throw new ApiError('Could not load this college.', error)
    return data ?? null
  },
  toOption: (c) => ({ id: c.id, label: c.name }),
}

/** Colleges with their course count, for the two pickers that tie an institute to its college. */
export const collegeWithCoursesSource: ServerSearchSource<College> = {
  ...collegeSource,
  toOption: (c) => ({
    id: c.id,
    label: c.name,
    sublabel: c.course_count != null ? `${c.course_count} course${c.course_count === 1 ? '' : 's'}` : undefined,
  }),
}

/** Consultancy and institute accounts (`GET /consultancies`, `search`), narrowed as the caller's list was. */
export function consultancySource(
  filters: { kind?: 'consultancy' | 'institute'; active?: boolean } = {},
): ServerSearchSource<Consultancy> {
  return {
    queryKey: ['picker', 'consultancies', filters.kind ?? '', filters.active ?? ''],
    fetchPage: async ({ search, cursor, signal }) => {
      const { data, error } = await api.GET('/consultancies', {
        params: { query: { ...filters, search: search || undefined, cursor, limit: PAGE } },
        signal,
      })
      if (error) throw new ApiError('Could not load consultancies.', error)
      return { items: data.items, nextCursor: data.meta.next_cursor }
    },
    fetchById: async (id, signal) => {
      const { data, error } = await api.GET('/consultancies/{id}', { params: { path: { id } }, signal })
      if (error) throw new ApiError('Could not load this account.', error)
      return data ?? null
    },
    toOption: (c) => ({ id: c.id!, label: c.name ?? '' }),
  }
}

/**
 * Students' own schools and colleges (`GET /institutions`, `q` — name and city together). There
 * is no route that returns one institution by id, so this source cannot resolve a saved id.
 */
export const institutionSource: ServerSearchSource<Institution> = {
  queryKey: ['picker', 'institutions'],
  fetchPage: async ({ search, cursor, signal }) => {
    const { data, error } = await api.GET('/institutions', {
      params: { query: { q: search || undefined, cursor, limit: PAGE } },
      signal,
    })
    if (error) throw new ApiError('Could not load institutions.', error)
    return { items: data.items ?? [], nextCursor: data.meta?.next_cursor }
  },
  toOption: (i) => ({ id: i.id, label: i.name }),
}
