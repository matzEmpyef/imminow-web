import { useState, type FormEvent } from 'react'
import { Modal } from '@/components/Modal'
import { Button } from '@/components/Button'
import { TextField } from '@/components/TextField'
import { CountrySelect } from '@/components/CountrySelect'
import { StateSelect } from '@/components/StateSelect'
import { DistrictSelect } from '@/components/DistrictSelect'
import { useCreateBranch, useUpdateBranch } from '@/queries/staff'
import { showToast } from '@/lib/toast'
import {
  branchLocationBody,
  branchLocationErrors,
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

  const locationErrors = branchLocationErrors(location)
  const showErrors = attempted
  const canSubmit = Boolean(name.trim() && address.trim()) && branchLocationIsValid(location)

  // Each level belongs to the one above it: keeping a state across a country change, or a district
  // across a state change, would carry a value the new list has never heard of straight into the
  // server's 422.
  function changeCountry(next: string) {
    setLocation((prev) => (next === prev.country ? prev : { ...prev, country: next, state: '', district: '' }))
  }

  function changeState(next: string) {
    setLocation((prev) => (next === prev.state ? prev : { ...prev, state: next, district: '' }))
  }

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

        <div className="flex flex-col gap-sm">
          <p className="text-body-sm font-medium text-text-primary">Where this branch is</p>
          <div className="grid grid-cols-2 items-start gap-sm">
            <CountrySelect label="Country" value={location.country} onChange={changeCountry} />
            <StateSelect
              label="State"
              country={location.country}
              value={location.state}
              onChange={changeState}
              required={Boolean(location.country)}
            />
          </div>
          {showErrors && locationErrors.state && (
            <p className="text-caption text-error">{locationErrors.state}</p>
          )}
          <div className="grid grid-cols-2 items-start gap-sm">
            <DistrictSelect
              label="District"
              country={location.country}
              state={location.state}
              value={location.district}
              onChange={(district) => setLocation((prev) => ({ ...prev, district }))}
              required={location.country === 'India'}
              error={showErrors ? locationErrors.district : undefined}
            />
            {/* City stays free text, the same call the job form made: there is no managed world
                city list, and a city is one rung below what the managed lists cover. */}
            <TextField
              label="City"
              value={location.city}
              onChange={(e) => setLocation((prev) => ({ ...prev, city: e.target.value }))}
            />
          </div>
          <p className="text-caption text-text-secondary">
            Students see your branches ordered by how near one is to them &mdash; same city first, then district, then
            state, then country. A branch with no location is never offered that way. You can save one without a
            location and come back to it.
          </p>
        </div>
      </form>
    </Modal>
  )
}
