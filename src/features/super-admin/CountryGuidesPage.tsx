import { useMemo, useState } from 'react'
import { Pencil, Trash2 } from 'lucide-react'
import { AdminShell } from '@/features/auth/AdminShell'
import { Button } from '@/components/Button'
import { Badge } from '@/components/Badge'
import { Modal } from '@/components/Modal'
import { Table, type TableColumn } from '@/components/Table'
import { StopPropagation } from '@/components/StopPropagation'
import { TextField } from '@/components/TextField'
import { Toggle } from '@/components/Toggle'
import { RichTextEditor } from '@/components/RichTextEditor'
import { useCountries } from '@/queries/countries'
import {
  useCountryContent,
  useDeleteCountryContent,
  useSaveCountryContent,
  type CountryContent,
} from '@/queries/countryContent'
import { formatDate } from '@/lib/time'

/**
 * Country Guides — the editorial write-up a student reads in the Sentpo app when they tap a
 * country while choosing where to study (user, 2026-08-23: "we will have a write up about a
 * country... the content show will be entered in immiNow... this content will be Rich text").
 *
 * One row per country in the shared Countries list, whether or not it has been written yet, so
 * the page doubles as the to-do list — an admin can see at a glance which destinations still have
 * nothing. Drafts are visible here and invisible to students.
 */
export function CountryGuidesPage() {
  const countries = useCountries()
  const content = useCountryContent()
  const [editing, setEditing] = useState<string | null>(null)

  // Every country gets a row, joined to its write-up if one exists. Listing only the written ones
  // would hide the gap this page exists to close.
  const rows = useMemo(() => {
    const byCountry = new Map((content.data ?? []).map((c) => [c.country, c]))
    return (countries.data ?? []).map((country) => ({
      country,
      entry: byCountry.get(country),
    }))
  }, [countries.data, content.data])

  const written = rows.filter((r) => r.entry).length
  const published = rows.filter((r) => r.entry?.published).length

  const columns: TableColumn<(typeof rows)[number]>[] = [
    {
      key: 'country',
      header: 'Country',
      render: (r) => <span className="font-medium text-text-primary">{r.country}</span>,
    },
    {
      key: 'summary',
      header: 'Summary',
      render: (r) => <span className="text-text-secondary">{r.entry?.summary || <em>Not written yet</em>}</span>,
    },
    {
      key: 'status',
      header: 'Status',
      render: (r) =>
        !r.entry ? (
          <Badge color="secondary">Empty</Badge>
        ) : r.entry.published ? (
          <Badge color="success">Published</Badge>
        ) : (
          <Badge color="warning">Draft</Badge>
        ),
    },
    {
      key: 'updated_at',
      header: 'Updated',
      render: (r) => (r.entry?.updated_at ? formatDate(r.entry.updated_at) : '—'),
    },
    {
      key: 'actions',
      header: '',
      align: 'right',
      render: (r) => (
        <StopPropagation className="flex justify-end gap-xs">
          <button
            type="button"
            onClick={() => setEditing(r.country)}
            aria-label={`Edit ${r.country} write-up`}
            title="Edit"
            className="flex h-9 w-9 items-center justify-center rounded-md text-text-secondary hover:bg-background hover:text-text-primary"
          >
            <Pencil className="h-4 w-4" />
          </button>
          {r.entry && <DeleteGuideTrigger country={r.country} />}
        </StopPropagation>
      ),
    },
  ]

  return (
    <AdminShell>
      <div className="flex flex-col gap-lg">
        <div>
          <h1 className="text-h1 text-text-primary">Country Guides</h1>
          <p className="text-body-sm text-text-secondary">
            What a student reads about a destination before adding it to their target countries. {published} of{' '}
            {rows.length} published{written > published && `, ${written - published} in draft`}.
          </p>
        </div>

        <Table
          columns={columns}
          rows={rows}
          rowKey={(r) => r.country}
          loading={countries.isLoading || content.isLoading}
          emptyMessage="No countries in the shared list yet."
          onRowClick={(r) => setEditing(r.country)}
        />

        {editing && (
          <GuideEditorModal
            country={editing}
            entry={(content.data ?? []).find((c) => c.country === editing)}
            onClose={() => setEditing(null)}
          />
        )}
      </div>
    </AdminShell>
  )
}

function GuideEditorModal({
  country,
  entry,
  onClose,
}: {
  country: string
  entry?: CountryContent
  onClose: () => void
}) {
  const save = useSaveCountryContent()
  const [summary, setSummary] = useState(entry?.summary ?? '')
  const [bodyHtml, setBodyHtml] = useState(entry?.body_html ?? '')
  const [published, setPublished] = useState(entry?.published ?? false)

  function handleSave() {
    save.mutate({ country, summary: summary.trim(), body_html: bodyHtml, published }, { onSuccess: () => onClose() })
  }

  return (
    <Modal
      onClose={onClose}
      title={`${country} — Country Guide`}
      widthRem={52}
      footer={
        <>
          {save.isError && <p className="mr-auto self-center text-body-sm text-error">{save.error.message}</p>}
          <div className="mr-auto flex items-center gap-sm self-center">
            <Toggle checked={published} onChange={setPublished} label={`Publish ${country} guide`} />
            <span className="text-body-sm text-text-secondary">
              {published ? 'Visible to students' : 'Draft — students see nothing'}
            </span>
          </div>
          <Button onClick={handleSave} loading={save.isPending}>
            Save
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-md">
        <TextField
          label="Summary"
          value={summary}
          onChange={(e) => setSummary(e.target.value)}
          placeholder="One line shown under the country name in the picker"
        />
        <div className="flex flex-col gap-xs">
          {/* A <label> can't reach a contentEditable div, so the visible caption is a span and
              the accessible name goes in via the editor's own ariaLabel prop. */}
          <span className="text-body-sm font-medium text-text-primary">Write-up</span>
          <RichTextEditor
            value={bodyHtml}
            onChange={setBodyHtml}
            ariaLabel="Country write-up"
            placeholder="Why a student should consider this country — costs, work rights, what happens after they graduate…"
          />
          <p className="text-caption text-text-secondary">
            Headings, bold, lists, quotes and links are kept. Anything else is stripped when you save, so the app
            renders it the same way every time.
          </p>
        </div>
      </div>
    </Modal>
  )
}

function DeleteGuideTrigger({ country }: { country: string }) {
  const remove = useDeleteCountryContent()
  const [confirming, setConfirming] = useState(false)

  return (
    <>
      <button
        type="button"
        onClick={() => setConfirming(true)}
        aria-label={`Remove ${country} write-up`}
        title="Remove"
        className="flex h-9 w-9 items-center justify-center rounded-md text-text-secondary hover:bg-background hover:text-error"
      >
        <Trash2 className="h-4 w-4" />
      </button>
      {confirming && (
        <Modal
          onClose={() => setConfirming(false)}
          title="Remove Country Guide"
          widthRem={26}
          footer={
            <>
              <Button variant="secondary" onClick={() => setConfirming(false)}>
                Cancel
              </Button>
              <Button
                variant="destructive"
                loading={remove.isPending}
                onClick={() => remove.mutate(country, { onSuccess: () => setConfirming(false) })}
              >
                Remove
              </Button>
            </>
          }
        >
          <p className="text-body text-text-primary">
            Delete the write-up for <strong>{country}</strong>? Students will stop seeing it immediately, and the text
            is not recoverable.
          </p>
        </Modal>
      )}
    </>
  )
}
