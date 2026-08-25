import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { AdminShell } from '@/features/auth/AdminShell'
import { SelectField } from '@/components/SelectField'
import { Card } from '@/components/Card'
import { Button } from '@/components/Button'
import { TextField } from '@/components/TextField'
import { useCreateConsultancy } from '@/queries/adminConsultancies'
import { EMAIL_ERROR, isValidEmail } from '@/lib/validation'

export function CreateConsultancyPage() {
  const navigate = useNavigate()
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
      { onSuccess: () => navigate('/admin/consultancies') },
    )
  }

  return (
    <AdminShell>
      <div className="flex flex-col gap-lg">
        <div>
          <h1 className="text-h1 text-text-primary">Create Consultancy</h1>
          <p className="text-body-sm text-text-secondary">
            One submission creates the consultancy, its primary branch, and the Consultancy Admin's invite.
          </p>
        </div>

        <Card className="max-w-[36rem]">
          <form onSubmit={handleSubmit} className="flex flex-col gap-lg">
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
              <TextField
                label="Branch address"
                value={branchAddress}
                onChange={(e) => setBranchAddress(e.target.value)}
              />
            </div>

            <div className="flex flex-col gap-md border-t border-border pt-md">
              <p className="text-body-sm font-medium text-text-primary">First Admin</p>
              <div className="grid grid-cols-2 gap-md">
                <TextField
                  label="First name"
                  value={adminFirstName}
                  onChange={(e) => setAdminFirstName(e.target.value)}
                />
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

            {createConsultancy.isError && <p className="text-body-sm text-error">{createConsultancy.error.message}</p>}

            <Button
              type="submit"
              loading={createConsultancy.isPending}
              disabled={!canSubmit}
              className="w-fit self-end mt-4"
            >
              Create Consultancy
            </Button>
          </form>
        </Card>
      </div>
    </AdminShell>
  )
}
