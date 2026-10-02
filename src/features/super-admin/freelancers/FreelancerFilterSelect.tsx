import { CompactSelect } from '@/components/CompactSelect'
import { useAllFreelancers } from '@/queries/freelancerRates'

/** Shared freelancer picker for the payouts tabs and payout history — lists the whole roster (walks every page of the cursor-paged GET /freelancers). */
export function FreelancerFilterSelect({ value, onChange }: { value: string; onChange: (id: string) => void }) {
  const freelancers = useAllFreelancers()

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
