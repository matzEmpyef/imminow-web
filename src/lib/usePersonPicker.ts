import { useMemo } from 'react'
import { useClients } from '@/queries/clients'
import { useLeads } from '@/queries/leads'

// The applicant/lead picker's data layer — Course Finder and Assign Task both need "every
// applicant, every active allocated lead" for their SearchSelect, and used to each fetch and
// filter it themselves. A fix applied to one (limit: 100 to stop silently truncating past 20;
// case_type: 'student' to exclude PR cases; unallocated: false to exclude the Lead Pool) was not
// automatically applied to the other, because each was its own copy of the same idea rather than
// one shared source (caught 2026-08-24). This hook is that one source — the FILTERING is what
// drifted, not the display, so it deliberately stops at the filtered rows rather than also
// dictating each caller's SearchSelect option labels/sublabels, which legitimately differ
// (Course Finder shows file numbers and "Self-sourced" tags; Assign Task doesn't).
export function usePersonPicker() {
  const clients = useClients({ limit: 100 })
  const clientRows = useMemo(() => (clients.data?.items ?? []).filter((c) => c.case_type === 'student'), [clients.data])
  const leads = useLeads({ showClosed: false, unallocated: false, limit: 100 })
  const leadRows = useMemo(() => (leads.data?.items ?? []).filter((l) => l.status === 'active'), [leads.data])

  return { clientRows, leadRows }
}
