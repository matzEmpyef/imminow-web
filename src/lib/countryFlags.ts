import { useMemo } from 'react'
import { useCountrySettings } from '@/queries/countries'

/**
 * Country NAME to ISO-3166 alpha-2 code.
 *
 * `CountryFlag` needs a code, and almost nothing in this console has one: a client's
 * `finalized_country`, a course's `country`, a commission entry's `destination_country`, a
 * consultancy's `countries_served` are all bare NAMES. That mismatch is why the flag lived on
 * exactly one screen for two days — the only one that happened to hold an `iso2` already.
 *
 * The lookup rides on the countries-settings query the console already caches for half an hour, so
 * it costs one shared request no matter how many labels a page renders.
 *
 * Lives here rather than beside `CountryLabel` because a file that exports both a hook and a
 * component breaks React Fast Refresh — the lint rule that says so is on, and it is right.
 */
export function useCountryIso2() {
  const settings = useCountrySettings()
  return useMemo(() => {
    const map = new Map<string, string>()
    for (const row of settings.data ?? []) {
      if (row.iso2) map.set(row.name.trim().toLowerCase(), row.iso2)
    }
    return map
  }, [settings.data])
}
