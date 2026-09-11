import { useState, type FormEvent } from 'react'
import { Button } from '@/components/Button'
import { TextField } from '@/components/TextField'
import { SelectField } from '@/components/SelectField'
import { FieldLabel } from '@/components/FieldLabel'
import { Modal } from '@/components/Modal'
import { ImageUploadField } from '@/components/ImageUploadField'
import { useCreateCollege, useUpdateCollege } from '@/queries/adminColleges'
import type { components } from '@/api/schema'

type College = components['schemas']['College']

// One form for adding and editing a college (2026-09-11). The list page's add/edit form had no
// rank, type or acceptance fields while the detail page's did, so a college edited from the list
// could never get them. Pass `college` to edit; omit it to add, with `onCreated` for where to go.
export function CollegeFormModal({
  college,
  onClose,
  onCreated,
}: {
  college?: College
  onClose: () => void
  onCreated?: (created: College) => void
}) {
  const isEditing = Boolean(college)
  const createCollege = useCreateCollege()
  const updateCollege = useUpdateCollege(college?.id ?? '')
  const mutation = isEditing ? updateCollege : createCollege

  const [name, setName] = useState(college?.name ?? '')
  const [logoUrl, setLogoUrl] = useState(college?.logo_url ?? '')
  const [website, setWebsite] = useState(college?.website ?? '')
  const [description, setDescription] = useState(college?.description ?? '')
  const [qsRank, setQsRank] = useState(college?.qs_rank != null ? String(college.qs_rank) : '')
  const [theRank, setTheRank] = useState(college?.the_rank != null ? String(college.the_rank) : '')
  const [institutionType, setInstitutionType] = useState(college?.institution_type ?? '')
  const [acceptanceRate, setAcceptanceRate] = useState(
    college?.acceptance_rate != null ? String(college.acceptance_rate) : '',
  )

  const acceptanceValid =
    acceptanceRate === '' || (Number(acceptanceRate) >= 0 && Number(acceptanceRate) <= 100)
  const canSave = Boolean(name.trim()) && acceptanceValid

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!canSave) return
    const body = {
      name: name.trim(),
      logo_url: logoUrl || null,
      website: website || null,
      description,
      qs_rank: qsRank === '' ? null : Number(qsRank),
      the_rank: theRank === '' ? null : Number(theRank),
      institution_type: (institutionType || null) as College['institution_type'],
      acceptance_rate: acceptanceRate === '' ? null : Number(acceptanceRate),
    }
    if (college) {
      updateCollege.mutate(body, { onSuccess: () => onClose() })
    } else {
      createCollege.mutate(
        { ...body, active: true },
        { onSuccess: (created: College) => (onCreated ? onCreated(created) : onClose()) },
      )
    }
  }

  return (
    <Modal
      onClose={onClose}
      title={isEditing ? 'Edit College' : 'Add College'}
      widthRem={30}
      footer={
        <>
          {mutation.isError && <p className="mr-auto self-center text-body-sm text-error">{mutation.error.message}</p>}
          <Button type="submit" form="college-form" loading={mutation.isPending} disabled={!canSave}>
            {isEditing ? 'Save Changes' : 'Create'}
          </Button>
        </>
      }
    >
      <form id="college-form" onSubmit={handleSubmit} className="flex flex-col gap-md">
        <TextField label="College name" required value={name} onChange={(e) => setName(e.target.value)} />
        <ImageUploadField
          label="Logo"
          value={logoUrl ?? ''}
          onChange={setLogoUrl}
          hint="Square — shown as a 56×56 circle in the app. Ideal size 200×200px."
        />
        <TextField label="Website" value={website ?? ''} onChange={(e) => setWebsite(e.target.value)} />
        <div className="grid grid-cols-2 gap-sm sm:grid-cols-4">
          <TextField label="QS rank" type="number" value={qsRank} onChange={(e) => setQsRank(e.target.value)} />
          <TextField label="THE rank" type="number" value={theRank} onChange={(e) => setTheRank(e.target.value)} />
          <TextField
            label="Acceptance %"
            type="number"
            min="0"
            max="100"
            value={acceptanceRate}
            onChange={(e) => setAcceptanceRate(e.target.value)}
          />
          <SelectField
            label="Type"
            id="college-type"
            value={institutionType ?? ''}
            onChange={(e) => setInstitutionType(e.target.value)}
          >
            <option value="">Not specified</option>
            <option value="university">University</option>
            <option value="college">College</option>
            <option value="institute">Institute</option>
          </SelectField>
        </div>
        {!acceptanceValid && <p className="text-caption text-error">Acceptance rate is a percentage, 0 to 100.</p>}
        <div className="flex flex-col gap-xs">
          <FieldLabel htmlFor="college-description">Description</FieldLabel>
          <textarea
            id="college-description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            className="rounded-md border border-border bg-surface p-sm text-body text-text-primary"
          />
        </div>
      </form>
    </Modal>
  )
}
