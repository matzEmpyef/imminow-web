import { useState, type FormEvent } from 'react'
import { SelectField } from '@/components/SelectField'
import { Button } from '@/components/Button'
import { Modal } from '@/components/Modal'
import { TextField } from '@/components/TextField'
import { useCreateConsultancy } from '@/queries/adminConsultancies'
import { EMAIL_ERROR, isValidEmail } from '@/lib/validation'

/**
 * Create Consultancy, as a popup on Manage Consultancies (user-requested, 2026-08-27).
 *
 * It was a page of its own with a sidebar entry, which put a one-off creation form at the same
 * level as the list you manage every day — and left you on a separate screen afterwards. The same
 * "wherever there is an add button, use a popup" rule the rest of this console already follows
 * (2026-08-15).
 */
export function CreateConsultancyModal({ onClose }: { onClose: () => void }) {
  const createConsultancy = useCreateConsultancy()

  const [name, setName] = useState('')
  const [city, setCity] = useState('')
  const [tier, setTier] = useState<'starter' | 'business' | 'ultimate'>('starter')
  const [branchAddress, setBranchAddress] = useState('')
  const [adminFirstName, setAdminFirstName] = useState('')
  const [adminLastName, setAdminLastName] = useState('')
  const [adminEmail, setAdminEmail] = useState('')
  const [filePrefix, setFilePrefix] = useState('')
  const [filePrefixTouched, setFilePrefixTouched] = useState(false)

  // Auto-suggests from the name (first 3 letters, uppercased) until the admin types their own —
  // user-requested, 2026-08-15: "let admin decide what it is... Default derive from consultancy
  // name."
  const derivedPrefix = name
    .replace(/[^a-zA-Z]/g, '')
    .slice(0, 3)
    .toUpperCase()
  const effectivePrefix = filePrefixTouched ? filePrefix : derivedPrefix

  const adminEmailError = adminEmail && !isValidEmail(adminEmail) ? EMAIL_ERROR : undefined
  const canSubmit = Boolean(
    name && city && branchAddress && adminFirstName && adminLastName && adminEmail && !adminEmailError,
  )

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!canSubmit) return
    createConsultancy.mutate(
      {
        name,
        city,
        tier,
        branch_address: branchAddress,
        admin_first_name: adminFirstName,
        admin_last_name: adminLastName,
        admin_email: adminEmail,
        file_number_prefix: effectivePrefix || undefined,
      },
      // Already on Manage Consultancies, and the list invalidates itself — closing is enough.
      { onSuccess: () => onClose() },
    )
  }

  return (
    <Modal
      onClose={onClose}
      title="Create Consultancy"
      widthRem={34}
      footer={
        <>
          {createConsultancy.isError && (
            <p className="mr-auto self-center text-body-sm text-error">{createConsultancy.error.message}</p>
          )}
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="submit"
            form="create-consultancy-form"
            loading={createConsultancy.isPending}
            disabled={!canSubmit}
          >
            Create Consultancy
          </Button>
        </>
      }
    >
      <p className="mb-md text-body-sm text-text-secondary">
        One submission creates the consultancy, its primary branch, and the Consultancy Admin&rsquo;s invite.
      </p>
      <form id="create-consultancy-form" onSubmit={handleSubmit} className="flex flex-col gap-lg">
        <div className="flex flex-col gap-md">
          <p className="text-body-sm font-medium text-text-primary">Company Details</p>
          <TextField label="Consultancy name" value={name} onChange={(e) => setName(e.target.value)} />
          <TextField label="City" value={city} onChange={(e) => setCity(e.target.value)} />
          <div className="flex flex-col gap-xs">
            <TextField
              label="File number prefix"
              value={effectivePrefix}
              onChange={(e) => {
                setFilePrefixTouched(true)
                setFilePrefix(
                  e.target.value
                    .toUpperCase()
                    .replace(/[^A-Z]/g, '')
                    .slice(0, 3),
                )
              }}
              maxLength={3}
              className="uppercase"
            />
            <p className="text-caption text-text-secondary">
              Prefixes every client file number this consultancy generates, e.g. "{effectivePrefix || '···'}
              0000001". Auto-suggested from the name — type over it to pick your own. Can't be changed once this
              consultancy has its first client.
            </p>
          </div>
          <SelectField
            label="Tier"
            id="tier"
            value={tier}
            onChange={(e) => setTier(e.target.value as 'starter' | 'business' | 'ultimate')}
          >
            <option value="starter">Starter</option>
            <option value="business">Business</option>
            <option value="ultimate">Ultimate</option>
          </SelectField>
        </div>

        <div className="flex flex-col gap-md border-t border-border pt-md">
          <p className="text-body-sm font-medium text-text-primary">Primary Office Address</p>
          <TextField label="Branch address" value={branchAddress} onChange={(e) => setBranchAddress(e.target.value)} />
        </div>

        <div className="flex flex-col gap-md border-t border-border pt-md">
          <p className="text-body-sm font-medium text-text-primary">First Admin</p>
          <div className="grid grid-cols-2 gap-md">
            <TextField label="First name" value={adminFirstName} onChange={(e) => setAdminFirstName(e.target.value)} />
            <TextField label="Last name" value={adminLastName} onChange={(e) => setAdminLastName(e.target.value)} />
          </div>
          <TextField
            label="Email"
            type="email"
            value={adminEmail}
            onChange={(e) => setAdminEmail(e.target.value)}
            error={adminEmailError}
          />
        </div>
      </form>
    </Modal>
  )
}
