import { useState, type FormEvent } from 'react'
import { Modal } from '@/components/Modal'
import { Button } from '@/components/Button'
import { TextField } from '@/components/TextField'
import { useCreateBranch, useUpdateBranch } from '@/queries/staff'
import { showToast } from '@/lib/toast'
import { BranchPlaceFields } from './BranchPlaceFields'
import {
  branchLocationBody,
  branchLocationIsValid,
  branchLocationOf,
  emptyBranchLocation,
  sameBranchLocation,
  type BranchLocationDraft,
} from './branchLocation'
import type { components } from '@/api/schema'

type Branch = components['schemas']['Branch']

/**
 * One form for Add and Edit (2026-09-21), the shape JobFormModal already uses. It was two files,
 * AddBranchModal and EditBranchModal, identical but for the verb — and the branch location landing
 * on both is exactly the kind of change that gets applied to one copy and not the other.
 *
 * THE LOCATION IS THE POINT OF THIS FORM NOW (product owner, 2026-09-21). A student picks which
 * BRANCH of a consultancy to talk to, and the list they pick from is ordered by how near a branch
 * is — same city, then district, then state, then country. None of that can read a free-text
 * address, so `address` goes back to being the street line and the four levels above it are picked
 * from the same managed lists the student's own filter reads.
 */
export function BranchFormModal({ branch, onClose }: { branch?: Branch; onClose: () => void }) {
  const isEditing = Boolean(branch)
  const createBranch = useCreateBranch()
  const updateBranch = useUpdateBranch(branch?.id ?? '')
  const mutation = isEditing ? updateBranch : createBranch

  const [name, setName] = useState(branch?.name ?? '')
  const [address, setAddress] = useState(branch?.address ?? '')
  // Whatever is already stored in `address` is carried in untouched — the field was relabelled, not
  // re-scoped, so an old row holding "B-42, Connaught Place, New Delhi" keeps every word of it
  // until somebody edits it themselves.
  const [storedLocation] = useState<BranchLocationDraft>(branch ? branchLocationOf(branch) : emptyBranchLocation)
  const [location, setLocation] = useState<BranchLocationDraft>(storedLocation)
  const [attempted, setAttempted] = useState(false)

  const showErrors = attempted
  const canSubmit = Boolean(name.trim() && address.trim()) && branchLocationIsValid(location)

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!canSubmit) {
      setAttempted(true)
      return
    }

    // On an edit, the location is sent ONLY when it actually changed. A PATCH that does not mention
    // the location never trips the server's four-field check, which is what keeps a branch that was
    // half-filled before this feature shipped editable — renaming it, or switching it off, must not
    // be blocked by a district nobody has picked yet.
    const locationChanged = !isEditing || !sameBranchLocation(location, storedLocation)
    const body = {
      name: name.trim(),
      address: address.trim(),
      ...(locationChanged ? branchLocationBody(location) : {}),
    }

    const onSuccess = () => {
      showToast(`${name.trim()} branch ${isEditing ? 'updated' : 'created'}`)
      onClose()
    }
    if (isEditing) updateBranch.mutate(body, { onSuccess })
    else createBranch.mutate(body, { onSuccess })
  }

  return (
    <Modal
      onClose={onClose}
      title={isEditing ? 'Edit Branch' : 'Add Branch'}
      widthRem={32}
      footer={
        <>
          {mutation.isError && <p className="mr-auto self-center text-body-sm text-error">{mutation.error.message}</p>}
          <Button type="submit" form="branch-form" loading={mutation.isPending}>
            {isEditing ? 'Save' : 'Create'}
          </Button>
        </>
      }
    >
      {/* `noValidate` — the console's convention since product review L3: inline errors under the
          field, never the browser's own bubbles, which cannot say "in India". */}
      <form id="branch-form" onSubmit={handleSubmit} noValidate className="flex flex-col gap-md">
        <TextField
          label="Name"
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          error={showErrors && !name.trim() ? 'A branch needs a name.' : undefined}
        />
        <div className="flex flex-col gap-xs">
          <TextField
            label="Street address"
            required
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            error={showErrors && !address.trim() ? 'A branch needs a street address.' : undefined}
          />
          <p className="text-caption text-text-secondary">
            Door number, building and road only &mdash; the city, district, state and country are the fields below.
          </p>
        </div>

        <BranchPlaceFields
          heading="Where this branch is"
          value={location}
          onChange={setLocation}
          showErrors={showErrors}
          caption={
            <>
              Students see your branches ordered by how near one is to them &mdash; same city first, then district,
              then state, then country. A branch with no location is never offered that way. You can save one without
              a location and come back to it.
            </>
          }
        />
      </form>
    </Modal>
  )
}
