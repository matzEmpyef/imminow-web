import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
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
