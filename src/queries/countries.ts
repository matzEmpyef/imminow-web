import { useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/api/client'
import { useAuthStore } from '@/stores/authStore'
import { ApiError } from './auth'

// Shared reference list (user-requested) — backs the Countries Served multiselect on
// Consultancy Management's Profile tab, plus the other country fields wired to it. Rarely
// changes, so a long staleTime is fine.
//
// `includeInactive` (review C6, 2026-09-12) — disabled countries are omitted by default (the
// point of disabling one), but a college can still have campuses in a country switched off after
// the fact. Management screens that filter/pick among EXISTING records (the Colleges & Courses
// country filter) need those included so a campus's country never quietly becomes unfilterable;
// screens offering a country for something NEW keep the default.
export function useCountries(options: { includeInactive?: boolean } = {}) {
  const isAuthed = useAuthStore((s) => Boolean(s.accessToken))
  const includeInactive = options.includeInactive ?? false
  return useQuery({
    queryKey: ['countries', { includeInactive }],
    queryFn: async () => {
      const { data, error } = await api.GET('/countries', {
        params: { query: includeInactive ? { include_inactive: true } : undefined },
      })
      if (error) throw new ApiError('Could not load the countries list.', error)
      return data
    },
    enabled: isAuthed,
    staleTime: 30 * 60 * 1000,
  })
}

// The states/provinces of one country (2026-09-15) — backs StateSelect and the targeting
// State/Province filter. One managed list per country: a value not on it is refused 422 by every
// endpoint that stores a state, so this is the only source these pickers should ever read from.
// `country` is undefined while nothing is chosen yet (e.g. the campus form before Country is
// picked) — `enabled` below just skips the request rather than asking the server about "".
export function useStates(country: string | undefined) {
  const isAuthed = useAuthStore((s) => Boolean(s.accessToken))
  return useQuery({
    queryKey: ['countries', country, 'states'],
    queryFn: async () => {
      const { data, error } = await api.GET('/countries/{name}/states', {
        params: { path: { name: country! } },
      })
      if (error) throw new ApiError('Could not load the states list.', error)
      return data
    },
    enabled: isAuthed && Boolean(country),
    staleTime: 30 * 60 * 1000,
  })
}

// The union of states across several countries at once (2026-09-15) — Targeting's State/Province
// filter needs options for however many "Country of residence" values are picked, and a hook
// cannot be called in a loop. Shares `useStates`'s exact query key, so a country already looked up
// elsewhere (e.g. the campus form) costs nothing here. Order of `countries` does not matter to the
// caller; this just returns every name it found, deduplicated.
export function useStatesForCountries(countries: string[]) {
  const isAuthed = useAuthStore((s) => Boolean(s.accessToken))
  const results = useQueries({
    queries: countries.map((country) => ({
      queryKey: ['countries', country, 'states'],
      queryFn: async () => {
        const { data, error } = await api.GET('/countries/{name}/states', {
          params: { path: { name: country } },
        })
        if (error) throw new ApiError('Could not load the states list.', error)
        return data
      },
      enabled: isAuthed,
      staleTime: 30 * 60 * 1000,
    })),
  })
  const names = new Set<string>()
  for (const result of results) {
    for (const state of result.data ?? []) names.add(state.name)
  }
  return {
    data: Array.from(names).sort((a, b) => a.localeCompare(b)),
    isLoading: results.some((r) => r.isLoading),
  }
}

// The Super Admin States & provinces modal's own list (2026-09-15) — unlike `useStates` above,
// this always asks for `include_inactive` so a switched-off state still shows up (with its toggle
// off) for an admin to review or turn back on. A distinct queryKey suffix ('managed') keeps this
// cache entry separate from the picker's — otherwise the picker's shorter, active-only list and
// this admin list would fight over the same cache slot depending on request order.
export function useManagedStates(country: string | undefined) {
  const isAuthed = useAuthStore((s) => Boolean(s.accessToken))
  return useQuery({
    queryKey: ['countries', country, 'states', 'managed'],
    queryFn: async () => {
      const { data, error } = await api.GET('/countries/{name}/states', {
        params: { path: { name: country! }, query: { include_inactive: true } },
      })
      if (error) throw new ApiError('Could not load the states list.', error)
      return data
    },
    enabled: isAuthed && Boolean(country),
    staleTime: 30 * 60 * 1000,
  })
}

export function useAddState(country: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (body: { name: string; type?: string }) => {
      const { data, error } = await api.POST('/countries/{name}/states', {
        params: { path: { name: country } },
        body,
      })
      if (error) throw new ApiError('Could not add this state.', error)
      return data
    },
    onSuccess: () => invalidateStateDependents(queryClient, country),
  })
}

export function useUpdateState(country: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({
      state,
      ...body
    }: {
      state: string
      name?: string
      type?: string
      active?: boolean
    }) => {
      const { data, error } = await api.PATCH('/countries/{name}/states/{state}', {
        params: { path: { name: country, state } },
        body,
      })
      if (error) throw new ApiError('Could not update this state.', error)
      return data
    },
    onSuccess: () => invalidateStateDependents(queryClient, country),
  })
}

// A rename or a switch off/on touches more than the states list itself: the picker (useStates /
// useStatesForCountries share its queryKey prefix, so ['countries', country, 'states'] covers
// both), and — for a rename specifically — every record the server carried the new name into
// (student profiles, campuses, institutions, partner locations, saved audiences). Those records'
// own list screens read from separate query keys that don't nest under 'countries', so they need
// naming here explicitly rather than falling out of the prefix invalidation above.
function invalidateStateDependents(queryClient: ReturnType<typeof useQueryClient>, country: string) {
  queryClient.invalidateQueries({ queryKey: ['countries', country, 'states'] })
  queryClient.invalidateQueries({ queryKey: ['institutions'] })
  queryClient.invalidateQueries({ queryKey: ['admin-colleges'] })
  queryClient.invalidateQueries({ queryKey: ['admin-college'] })
  queryClient.invalidateQueries({ queryKey: ['partner-colleges'] })
  queryClient.invalidateQueries({ queryKey: ['redemption-partners'] })
}

// Super Admin only (user-requested) — manages the list every consultancy reads from above.
export function useCreateCountry() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (name: string) => {
      const { data, error } = await api.POST('/countries', { body: { name } })
      if (error) throw new ApiError('Could not add this country.', error)
      return data
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['countries'] }),
  })
}

// Per-country platform settings (2026-09-02) — today just the default fee currency a student
// resident there sees until they pick another in the Sentpo app's Search filter drawer.
export function useCountrySettings() {
  const isAuthed = useAuthStore((s) => Boolean(s.accessToken))
  return useQuery({
    queryKey: ['countries', 'settings'],
    queryFn: async () => {
      const { data, error } = await api.GET('/countries/settings')
      if (error) throw new ApiError('Could not load country settings.', error)
      return data
    },
    enabled: isAuthed,
    staleTime: 30 * 60 * 1000,
  })
}

export function useUpdateCountryCurrency() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ name, currency }: { name: string; currency: string }) => {
      const { data, error } = await api.PATCH('/countries/{name}', {
        params: { path: { name } },
        body: { default_currency: currency },
      })
      if (error) throw new ApiError('Could not update the default currency.', error)
      return data
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['countries'] }),
  })
}

/// Disable / re-enable, the REVERSIBLE alternative to deleting. See CountrySetting.active in the
/// contract for why an admin almost always wants this instead.
export function useSetCountryActive() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ name, active, confirm }: { name: string; active: boolean; confirm?: boolean }) => {
      // Switching a country off that colleges have campuses in is refused 409 `in_use` (its
      // `details.college_names` names them) until `confirm: true` (review C6, 2026-09-12).
      const { data, error } = await api.PATCH('/countries/{name}', {
        params: { path: { name } },
        body: { active, confirm },
      })
      if (error) throw new ApiError('Could not update this country.', error)
      return data
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['countries'] }),
  })
}

/// The two decision windows (2026-09-09). Both were PATCHable from the day they were added and
/// editable from nowhere — the console showed the resolved number and offered no way to change it,
/// so setting one meant a curl. `expected_close_days` in particular is an admitted guess that
/// drives every accepted-but-not-closed signal, which makes "unreachable from the console" the
/// wrong place for it to live.
export function useUpdateCountryWindow() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({
      name,
      field,
      days,
    }: {
      name: string
      field: 'offer_turnaround_days' | 'expected_close_days'
      days: number
    }) => {
      const { data, error } = await api.PATCH('/countries/{name}', {
        params: { path: { name } },
        body: { [field]: days },
      })
      if (error) throw new ApiError('Could not update this window.', error)
      return data
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['countries'] }),
  })
}

export function useDeleteCountry() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (name: string) => {
      const { error } = await api.DELETE('/countries/{name}', { params: { path: { name } } })
      if (error) throw new ApiError('Could not remove this country.', error)
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['countries'] }),
  })
}
