import { ServerSearchSelect } from '@/components/ServerSearchSelect'
import { consultancySource } from '@/queries/pickerSources'

const ALL_ACCOUNTS = consultancySource()

/**
 * The Consultancy filter shared by the Cases, Awaiting and Payment History tabs (2026-09-11).
 *
 * Searched on the server (review F-038). It used to load 100 consultancies once and narrow them
 * in the browser, so with more accounts than that the rest could not be chosen as a filter. A
 * value that is not among the loaded results (a filter restored from the address, a rate being
 * edited) is shown by reading that one account by id.
 */
export function ConsultancySearchSelect({
  value,
  onChange,
  placeholder = 'Any consultancy',
}: {
  value: string
  onChange: (id: string) => void
  placeholder?: string
}) {
  return (
    <ServerSearchSelect
      source={ALL_ACCOUNTS}
      value={value}
      onChange={(id) => onChange(id)}
      placeholder={placeholder}
      ariaLabel="Consultancy"
    />
  )
}
