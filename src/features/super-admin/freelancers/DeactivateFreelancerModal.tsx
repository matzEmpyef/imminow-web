import { Modal } from '@/components/Modal'
import { Button } from '@/components/Button'
import { useUpdateFreelancer, type Freelancer } from '@/queries/freelancerRates'

/** Same confirm copy the pre-rebuild FreelancersPage used — deliberately kept, still accurate. */
export function DeactivateFreelancerModal({ freelancer, onClose }: { freelancer: Freelancer; onClose: () => void }) {
  const updateFreelancer = useUpdateFreelancer()

  return (
    <Modal
      onClose={onClose}
      title="Deactivate Freelancer"
      widthRem={28}
      footer={
        <>
          {updateFreelancer.isError && (
            <p className="mr-auto self-center text-body-sm text-error">{updateFreelancer.error.message}</p>
          )}
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            loading={updateFreelancer.isPending}
            onClick={() => updateFreelancer.mutate({ id: freelancer.id, active: false }, { onSuccess: onClose })}
          >
            Deactivate
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-sm">
        <p className="text-body text-text-primary">
          Deactivate <span className="font-medium">{freelancer.name}</span>?
        </p>
        <ul className="flex list-disc flex-col gap-xs pl-lg text-body-sm text-text-secondary">
          <li>They can no longer sign in — any active session stops working immediately.</li>
          <li>
            Their referral code <span className="font-mono">{freelancer.referral_code}</span> stops attributing new
            students. Anyone who signs up with it is simply unattributed.
          </li>
          <li>
            Payouts already earned on students they referred stay owed and visible — nothing is deleted, and this can
            be undone.
          </li>
        </ul>
      </div>
    </Modal>
  )
}
