import { useState, type FormEvent } from 'react'
import { Building2, GraduationCap, Search, X } from 'lucide-react'
import { SelectField } from '@/components/SelectField'
import { Button } from '@/components/Button'
import { Modal } from '@/components/Modal'
import { TextField } from '@/components/TextField'
import { SearchSelect } from '@/components/SearchSelect'
import { SegmentedControl } from '@/components/SegmentedControl'
import { useAuthStore } from '@/stores/authStore'
import { useCreateConsultancy } from '@/queries/adminConsultancies'
import { useAdminColleges } from '@/queries/adminColleges'
import { useUserSearch } from '@/queries/supportTools'
import { EMAIL_ERROR, isValidEmail } from '@/lib/validation'
import type { components } from '@/api/schema'

type AccountKind = NonNullable<components['schemas']['Consultancy']['kind']>
type AdminMode = 'invite' | 'attach'

/**
 * Create Consultancy, as a popup on Manage Consultancies (user-requested, 2026-08-27).
 *
 * It was a page of its own with a sidebar entry, which put a one-off creation form at the same
 * level as the list you manage every day — and left you on a separate screen afterwards. The same
 * "wherever there is an add button, use a popup" rule the rest of this console already follows
 * (2026-08-15).
 *
 * It now creates INSTITUTE accounts too (INSTITUTE_ACCOUNT_PLAN D6/D8, 2026-09-10). An institute
 * is the same record with `kind: 'institute'` and the `college_id` it speaks for, so this is one
 * form with two branches rather than a second creation flow:
 *
 *  - **The college** is optional even for an institute. D8's linking works in either order, and
 *    the common case is the reverse of the consultancy one — the college has been in the
 *    catalogue with its campuses and courses since seeding, so what is new is a PERSON from it.
 *    Created unlinked, the college attaches later from Manage; it is write-once either way.
 *  - **The admin** arrives in exactly one of two mutually exclusive forms, and the server refuses
 *    a request carrying both or neither (400). So this is a segmented choice, not two optional
 *    field groups: the trio INVITES a new login, `admin_user_id` ATTACHES an existing one.
 */
export function CreateConsultancyModal({ onClose }: { onClose: () => void }) {
  const createConsultancy = useCreateConsultancy()
  // T8: one key per modal open — see the N7 payment fix for the pattern.
  const [idempotencyKey] = useState(() => crypto.randomUUID())

  // ONLY A SUPER ADMIN CREATES AN INSTITUTE, and ATTACH is institute-only (user, 2026-09-10).
  // One decision in two halves, and the second half is what makes the first work.
  //
  // The attach form needs to find the user, and the only endpoint that searches people is gated on
  // `support` while creating an account is gated on `consultancy_approval`. A Super Admin holds
  // every flag, so confining institutes to them removes the mismatch — but only once attach stops
  // being reachable for CONSULTANCY creation too, where a staffer with `consultancy_approval`
  // alone would meet the same empty picker. Attach exists FOR institutes (D8's create-the-login-
  // first direction); a consultancy has always been invite-only.
  //
  // The server enforces both (403 and 400). This hides what the caller cannot use, so nobody
  // fills in a form that was going to be refused.
  const isSuperAdmin = useAuthStore((state) => state.user?.role === 'super_admin')
  const [kind, setKind] = useState<AccountKind>('consultancy')
  const [adminMode, setAdminMode] = useState<AdminMode>('invite')
  const [name, setName] = useState('')
  const [city, setCity] = useState('')
  const [tier, setTier] = useState<'starter' | 'business' | 'ultimate'>('starter')
  const [branchAddress, setBranchAddress] = useState('')
  const [collegeId, setCollegeId] = useState('')
  const [adminFirstName, setAdminFirstName] = useState('')
  const [adminLastName, setAdminLastName] = useState('')
  const [adminEmail, setAdminEmail] = useState('')
  const [adminUser, setAdminUser] = useState<{ id: string; name: string; email: string } | null>(null)
  const [filePrefix, setFilePrefix] = useState('')
  const [filePrefixTouched, setFilePrefixTouched] = useState(false)

  const isInstitute = kind === 'institute'
  // The same catalogue Colleges & Courses manages — an institute account never invents a college,
  // it claims one that already exists (D8).
  const colleges = useAdminColleges({ limit: 100 })
  const collegeOptions = (colleges.data?.items ?? []).map((c) => ({
    id: c.id,
    label: c.name,
    // The course count is the fact that matters here: it becomes the entire catalogue this
    // account can ever see, so linking a college with none is worth noticing before submitting.
    sublabel: c.course_count != null ? `${c.course_count} course${c.course_count === 1 ? '' : 's'}` : undefined,
  }))

  // Auto-suggests from the name (first 3 letters, uppercased) until the admin types their own —
  // user-requested, 2026-08-15: "let admin decide what it is... Default derive from consultancy
  // name."
  const derivedPrefix = name
    .replace(/[^a-zA-Z]/g, '')
    .slice(0, 3)
    .toUpperCase()
  const effectivePrefix = filePrefixTouched ? filePrefix : derivedPrefix

  const adminEmailError = adminEmail && !isValidEmail(adminEmail) ? EMAIL_ERROR : undefined
  const adminReady =
    adminMode === 'invite'
      ? Boolean(adminFirstName && adminLastName && adminEmail && !adminEmailError)
      : Boolean(adminUser)
  const canSubmit = Boolean(name && city && branchAddress && adminReady)

  const kindNoun = isInstitute ? 'Institute' : 'Consultancy'

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    // T8: Enter-Enter before the button disabled created two consultancies.
    if (createConsultancy.isPending) return
    if (!canSubmit) return
    createConsultancy.mutate(
      {
        name,
        city,
        tier,
        kind,
        // Never sent for a consultancy — one carrying a college_id is refused 400. Omitted for an
        // unlinked institute too: `college_id: ''` is not "no college", it is an unknown one.
        ...(isInstitute && collegeId ? { college_id: collegeId } : {}),
        branch_address: branchAddress,
        // Exactly one form. Empty strings would still read as "the invite form was used" to the
        // server's `Boolean(admin_first_name || ...)` check, so the unused half is omitted whole.
        ...(adminMode === 'invite'
          ? { admin_first_name: adminFirstName, admin_last_name: adminLastName, admin_email: adminEmail }
          : { admin_user_id: adminUser!.id }),
        file_number_prefix: effectivePrefix || undefined,
        idempotencyKey,
      },
      // Already on Manage Consultancies, and the list invalidates itself — closing is enough.
      { onSuccess: () => onClose() },
    )
  }

  return (
    <Modal
      onClose={onClose}
      title="Create Account"
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
            Create {kindNoun}
          </Button>
        </>
      }
    >
      <p className="mb-md text-body-sm text-text-secondary">
        {isInstitute
          ? 'One submission creates the institute account, its primary branch, and its first admin. Institutes are verified offline before onboarding, so the account is created already verified.'
          : "One submission creates the consultancy, its primary branch, and the Consultancy Admin's invite."}
      </p>
      <form id="create-consultancy-form" onSubmit={handleSubmit} className="flex flex-col gap-lg">
        {isSuperAdmin && (
        <SegmentedControl<AccountKind>
          label="Account type"
          value={kind}
          onChange={(next) => {
            setKind(next)
            if (next === 'consultancy') {
              setCollegeId('')
              // Attach is institute-only, so leaving the mode behind would submit a body the
              // server refuses with a 400 the user did nothing to deserve.
              setAdminMode('invite')
            }
          }}
          options={[
            {
              value: 'consultancy',
              label: 'Consultancy',
              description: 'Works across many colleges',
              icon: <Building2 className="h-4 w-4" />,
            },
            {
              value: 'institute',
              label: 'Institute',
              description: 'A college running its own account',
              icon: <GraduationCap className="h-4 w-4" />,
            },
          ]}
        />
        )}

        <div className="flex flex-col gap-md">
          <p className="text-body-sm font-medium text-text-primary">Company Details</p>
          <TextField
            label={`${kindNoun} name`}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
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
              Prefixes every client file number this {kindNoun.toLowerCase()} generates, e.g. "
              {effectivePrefix || '···'}
              0000001". Auto-suggested from the name — type over it to pick your own. Can't be changed once this{' '}
              {kindNoun.toLowerCase()} has its first client.
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

        {isInstitute && (
          <div className="flex flex-col gap-md border-t border-border pt-md">
            <p className="text-body-sm font-medium text-text-primary">College</p>
            <div className="flex flex-col gap-xs">
              <label className="text-body-sm font-medium text-text-primary" htmlFor="institute-college">
                College this institute speaks for
              </label>
              <SearchSelect
                id="institute-college"
                options={collegeOptions}
                value={collegeId}
                onChange={setCollegeId}
                placeholder={colleges.isLoading ? 'Loading colleges…' : 'Search the catalogue…'}
                disabled={colleges.isLoading}
              />
              <p className="text-caption text-text-secondary">
                Optional. Leave it empty to create the login now and attach the college later from Manage — in practice
                the order institutes arrive in. Either way it can only be set <strong>once</strong>: moving an account
                between colleges would silently reassign every case on it. Its courses become the only catalogue this
                account can see, and its partner colleges become itself.
              </p>
            </div>
          </div>
        )}

        <div className="flex flex-col gap-md border-t border-border pt-md">
          <p className="text-body-sm font-medium text-text-primary">Primary Office Address</p>
          <TextField label="Branch address" value={branchAddress} onChange={(e) => setBranchAddress(e.target.value)} />
        </div>

        <div className="flex flex-col gap-md border-t border-border pt-md">
          <p className="text-body-sm font-medium text-text-primary">First Admin</p>
          {isInstitute ? (
            <SegmentedControl<AdminMode>
              label="How this account gets its first admin"
              hideLabel
              value={adminMode}
              onChange={setAdminMode}
              options={[
                { value: 'invite', label: 'Invite a new admin', description: 'Sends them a set-password link' },
                { value: 'attach', label: 'Attach an existing user', description: 'Someone already on the platform' },
              ]}
            />
          ) : (
            // A consultancy is invite-only, so there is no choice to offer — see the note at the
            // top of this file for why attach is confined to institutes.
            <p className="text-body-sm text-text-secondary">
              The Consultancy Admin is invited by email and sets their own password.
            </p>
          )}
          {adminMode === 'invite' ? (
            <>
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
            </>
          ) : (
            <ExistingUserPicker selected={adminUser} onSelect={setAdminUser} />
          )}
        </div>
      </form>
    </Modal>
  )
}

/**
 * Picks the existing login that becomes this account's Consultancy Admin (D8's attach form).
 *
 * Searches the whole user directory rather than the console's own staff directory, because the
 * person being attached is by definition NOT staff yet — someone from the college with a Sentpo
 * login is the ordinary case.
 *
 * A user who already holds an active employee row anywhere is refused by the server (every
 * tenancy check derives from one employee row per user, so a second would make the answer depend
 * on row order), and that refusal is what this relies on. The row deliberately does NOT try to
 * pre-empt it by showing `consultancy_name`: `GET /users/search` reports that field as the ONE
 * seeded tenant for every result rather than the user's actual employer (mock-server
 * `toUserSearchResult`), so rendering it here would put a confidently wrong company name next to
 * a name. Reported 2026-09-10; when it is fixed, showing it becomes worth doing.
 */
function ExistingUserPicker({
  selected,
  onSelect,
}: {
  selected: { id: string; name: string; email: string } | null
  onSelect: (user: { id: string; name: string; email: string } | null) => void
}) {
  const [query, setQuery] = useState('')
  const trimmed = query.trim()
  const results = useUserSearch(trimmed.length >= 2 ? trimmed : '')

  if (selected) {
    return (
      <div className="flex items-center justify-between gap-sm rounded-md border border-border bg-background p-sm">
        <div className="min-w-0">
          <p className="truncate text-body-sm font-medium text-text-primary">{selected.name}</p>
          <p className="truncate text-caption text-text-secondary">{selected.email}</p>
        </div>
        <button
          type="button"
          onClick={() => onSelect(null)}
          aria-label="Choose a different user"
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-text-secondary hover:bg-surface hover:text-text-primary"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-xs">
      <TextField
        label="Search by name or email"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="e.g. laila@…"
      />
      {trimmed.length < 2 ? (
        <p className="flex items-center gap-xs text-caption text-text-secondary">
          <Search className="h-3.5 w-3.5" />
          Type at least two characters to search every login on the platform.
        </p>
      ) : results.isLoading ? (
        <p className="text-caption text-text-secondary">Searching…</p>
      ) : results.isError ? (
        <p className="text-caption text-error">Could not run this search.</p>
      ) : (results.data ?? []).length === 0 ? (
        <p className="text-caption text-text-secondary">No matches for &ldquo;{trimmed}&rdquo;.</p>
      ) : (
        <ul className="flex max-h-56 flex-col overflow-y-auto rounded-md border border-border">
          {(results.data ?? []).map((user) => (
            <li key={user.id} className="border-b border-border last:border-b-0">
              <button
                type="button"
                onClick={() => onSelect({ id: user.id!, name: user.name, email: user.email })}
                className="flex w-full flex-col px-sm py-sm text-left hover:bg-background"
              >
                <span className="text-body-sm text-text-primary">{user.name}</span>
                <span className="text-caption text-text-secondary">{user.email}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
