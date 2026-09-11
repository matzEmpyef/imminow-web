import { useMemo } from 'react'
import { SearchSelect } from '@/components/SearchSelect'
import { useAdminConsultancies } from '@/queries/adminConsultancies'

/**
 * The Consultancy filter shared by the Cases, Awaiting and Payment History tabs (2026-09-11).
 *
 * Fetches up to 100 consultancies once — the old page's plain `<select>` read whatever page
 * useAdminConsultancies() happened to default to (20), so any consultancy past the first page was
 * simply unreachable as a filter. SearchSelect itself narrows the list client-side as the admin
 * types, same as every other consumer of this component.
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
  const consultancies = useAdminConsultancies({ limit: 100 })
  const options = useMemo(
    () => (consultancies.data?.items ?? []).map((c) => ({ id: c.id, label: c.name })),
    [consultancies.data],
  )
  return <SearchSelect options={options} value={value} onChange={onChange} placeholder={placeholder} />
}
