import { CompactSelect } from '@/components/CompactSelect'
import { useFreelancers } from '@/queries/freelancerRates'

/** Shared freelancer picker for the payouts tabs and payout history — the roster is small enough to list in full (see GET /freelancers' contract note). */
export function FreelancerFilterSelect({ value, onChange }: { value: string; onChange: (id: string) => void }) {
  const freelancers = useFreelancers()

  return (
    <CompactSelect value={value} onChange={(e) => onChange(e.target.value)} label="Freelancer">
      <option value="">All freelancers</option>
      {freelancers.data?.map((f) => (
        <option key={f.id} value={f.id}>
          {f.name}
        </option>
      ))}
    </CompactSelect>
  )
}
