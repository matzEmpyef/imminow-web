import { useState, type FormEvent } from 'react'
import { Modal } from '@/components/Modal'
import { Button } from '@/components/Button'
import { TextField } from '@/components/TextField'
import { useUpdateClientDetails } from '@/queries/clients'

// User-requested (2026-08-15) — "we need an option to update Overview details like address" from
// Client Profile's Overview tab. Only address and phone are editable here; everything else on
// Overview (tags, branch, plan) already has its own dedicated control.
export function EditClientDetailsModal({
  clientId,
  currentAddress,
  currentPhone,
  onClose,
}: {
  clientId: string
  currentAddress: string | null | undefined
  currentPhone: string | null | undefined
  onClose: () => void
}) {
  const updateDetails = useUpdateClientDetails()
  const [address, setAddress] = useState(currentAddress ?? '')
  const [phone, setPhone] = useState(currentPhone ?? '')

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    updateDetails.mutate(
      { id: clientId, address: address.trim() || null, phone: phone.trim() || null },
      { onSuccess: onClose },
    )
  }

  return (
    <Modal
      onClose={onClose}
      title="Edit Overview Details"
      widthRem={26}
      footer={
        <>
          {updateDetails.isError && (
            <p className="mr-auto self-center text-body-sm text-error">{updateDetails.error.message}</p>
          )}
          <div className="flex gap-sm">
            <Button type="submit" form="edit-client-details-form" loading={updateDetails.isPending}>
              Save
            </Button>
            <Button type="button" variant="secondary" onClick={onClose}>
              Cancel
            </Button>
          </div>
        </>
      }
    >
      <form id="edit-client-details-form" onSubmit={handleSubmit} className="flex flex-col gap-md">
        <TextField label="Phone" value={phone} onChange={(e) => setPhone(e.target.value)} />
        <TextField label="Address" value={address} onChange={(e) => setAddress(e.target.value)} />
      </form>
    </Modal>
  )
}
