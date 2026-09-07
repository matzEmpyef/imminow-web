import { useState, type FormEvent } from 'react'
import { AdminShell } from '@/features/auth/AdminShell'
import { Card } from '@/components/Card'
import { Button } from '@/components/Button'
import { Badge } from '@/components/Badge'
import { TextField } from '@/components/TextField'
import { Modal } from '@/components/Modal'
import { Table, type TableColumn } from '@/components/Table'
import { useCreateStudyLevel, useStudyLevels, useUpdateStudyLevel } from '@/queries/studyLevels'
import type { components } from '@/api/schema'

type StudyLevel = components['schemas']['StudyLevel']

// A code is what every course row and every student preference stores forever, so it is derived
// from the label ONCE, at creation, and shown as an editable field before the admin commits —
// rather than generated silently, which is how you end up with `master_s` and nobody noticing
// until a filter returns nothing.
function slugify(label: string) {
  return label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
}

function RenameLevelModal({ level, onClose }: { level: StudyLevel; onClose: () => void }) {
  const update = useUpdateStudyLevel()
  const [label, setLabel] = useState(level.label)

  return (
    <Modal
      onClose={onClose}
      title="Rename study level"
      widthRem={26}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            loading={update.isPending}
            disabled={!label.trim() || label.trim() === level.label}
            onClick={() =>
              update.mutate({ code: level.code, label: label.trim() }, { onSuccess: onClose })
            }
          >
            Save
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-md">
        <TextField label="Label" value={label} onChange={(e) => setLabel(e.target.value)} />
        <p className="text-body-sm text-text-secondary">
          Wording only. The code <span className="font-mono text-text-primary">{level.code}</span> stays as it is —
          courses and student preferences already store it, and changing it would orphan every one of them without
          an error anywhere.
        </p>
        {update.isError && <p className="text-body-sm text-error">{update.error.message}</p>}
      </div>
    </Modal>
  )
}

// Retiring is refused server-side while anything still points at the rung, and the refusal names
// the counts — so this shows the server's message rather than pre-guessing with a count of its
// own that could disagree.
function RetireLevelTrigger({ level }: { level: StudyLevel }) {
  const update = useUpdateStudyLevel()
  const [confirming, setConfirming] = useState(false)
  const retired = level.active === false

  if (retired) {
    return (
      <button
        onClick={() => update.mutate({ code: level.code, active: true })}
        disabled={update.isPending}
        className="text-caption text-primary hover:underline disabled:opacity-50"
      >
        Restore
      </button>
    )
  }

  return (
    <>
      <button
        onClick={() => setConfirming(true)}
        className="text-caption text-error hover:underline"
        aria-label={`Retire ${level.label}`}
      >
        Retire
      </button>
      {confirming && (
        <Modal
          onClose={() => setConfirming(false)}
          title="Retire study level"
          widthRem={26}
          footer={
            <>
              <Button variant="secondary" onClick={() => setConfirming(false)}>
                Cancel
              </Button>
              <Button
                variant="destructive"
                loading={update.isPending}
                onClick={() =>
                  update.mutate(
                    { code: level.code, active: false },
                    { onSuccess: () => setConfirming(false) },
                  )
                }
              >
                Retire
              </Button>
            </>
          }
        >
          <div className="flex flex-col gap-sm">
            <p className="text-body-sm text-text-secondary">
              Stop offering <span className="font-medium text-text-primary">{level.label}</span> in course forms and
              in the Sentpo app&apos;s pickers. It stays in the table, so courses and students already on it keep
              reading correctly — and it can be restored here at any time.
            </p>
            {update.isError && <p className="text-body-sm text-error">{update.error.message}</p>}
          </div>
        </Modal>
      )}
    </>
  )
}

// Order is a ladder, not an alphabet, so it is moved a step at a time rather than typed: swapping
// two neighbours' sort_order is the only reorder that cannot produce a gap or a tie.
function ReorderCell({ level, rows }: { level: StudyLevel; rows: StudyLevel[] }) {
  const update = useUpdateStudyLevel()
  const index = rows.findIndex((r) => r.code === level.code)

  function swapWith(other: StudyLevel | undefined) {
    if (!other) return
    const mine = level.sort_order ?? 0
    const theirs = other.sort_order ?? 0
    update.mutate({ code: level.code, sort_order: theirs })
    update.mutate({ code: other.code, sort_order: mine })
  }

  return (
    <div className="flex items-center gap-xs">
      <button
        onClick={() => swapWith(rows[index - 1])}
        disabled={index <= 0 || update.isPending}
        className="rounded px-xs text-caption text-text-secondary hover:text-text-primary disabled:opacity-30"
        aria-label={`Move ${level.label} up`}
      >
        ↑
      </button>
      <button
        onClick={() => swapWith(rows[index + 1])}
        disabled={index < 0 || index >= rows.length - 1 || update.isPending}
        className="rounded px-xs text-caption text-text-secondary hover:text-text-primary disabled:opacity-30"
        aria-label={`Move ${level.label} down`}
      >
        ↓
      </button>
      <span className="text-caption text-text-secondary tabular-nums">{level.sort_order ?? '—'}</span>
    </div>
  )
}

/**
 * The education ladder (2026-09-07) — the ONE list behind a student's Target study level and a
 * course's Level.
 *
 * Both were hardcoded before this page existed, and they disagreed: the course form was a free
 * text box ("e.g. masters") while the Sentpo app filtered against a title-cased four, so a course
 * saved as "MSc" or "PG" was invisible to every student who filtered by level. Expanding past
 * India made a second problem obvious — 10th and 12th mean nothing in the UK, and a rung a market
 * needs should not wait for a mobile release.
 */
export function StudyLevelsPage() {
  const levels = useStudyLevels(true)
  const createLevel = useCreateStudyLevel()
  const [label, setLabel] = useState('')
  const [code, setCode] = useState('')
  const [codeEdited, setCodeEdited] = useState(false)

  const rows = levels.data ?? []
  const effectiveCode = codeEdited ? code : slugify(label)

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!label.trim() || !effectiveCode) return
    createLevel.mutate(
      { label: label.trim(), code: effectiveCode },
      {
        onSuccess: () => {
          setLabel('')
          setCode('')
          setCodeEdited(false)
        },
      },
    )
  }

  const columns: TableColumn<StudyLevel>[] = [
    {
      key: 'label',
      header: 'Label',
      render: (row) => (
        <span className={row.active === false ? 'text-text-secondary line-through' : 'font-medium'}>{row.label}</span>
      ),
    },
    {
      key: 'code',
      header: 'Code (stored)',
      hideBelow: 'sm',
      render: (row) => <span className="font-mono text-caption text-text-secondary">{row.code}</span>,
    },
    { key: 'order', header: 'Order', render: (row) => <ReorderCell level={row} rows={rows} /> },
    {
      // Shown because retiring a rung is refused while courses still sit on it — an admin should
      // see what is holding a rung BEFORE they hit that refusal, not after.
      key: 'courses',
      header: 'Courses',
      align: 'right',
      render: (row) => (
        <span className="tabular-nums text-text-secondary">{row.course_count ?? 0}</span>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (row) =>
        row.active === false ? <Badge color="secondary">Retired</Badge> : <Badge color="success">Offered</Badge>,
    },
    {
      key: 'actions',
      header: '',
      align: 'right',
      render: (row) => <RowActions level={row} />,
    },
  ]

  return (
    <AdminShell>
      <div className="flex flex-col gap-lg">
        <div>
          <h1 className="text-h1 text-text-primary">Study Levels</h1>
          <p className="text-body-sm text-text-secondary">
            One ladder, read in two places: the level a course teaches at, and the level a student says they are
            aiming for. Search matches one against the other, so they have to be the same list — a rung added here
            appears in the course form and in the Sentpo app&apos;s Target study level picker without an app release.
          </p>
        </div>

        <Card className="max-w-[40rem]">
          <form onSubmit={handleSubmit} className="flex flex-col gap-sm">
            <div className="flex items-end gap-sm">
              {/* No placeholder: TextField rests its label INSIDE the field until it floats, so a
                  placeholder renders straight through it ("Labelundation"). */}
              <TextField label="Label" value={label} onChange={(e) => setLabel(e.target.value)} className="flex-1" />
              <TextField
                label="Code"
                value={effectiveCode}
                onChange={(e) => {
                  setCodeEdited(true)
                  setCode(e.target.value)
                }}
                className="flex-1"
              />
              <Button type="submit" loading={createLevel.isPending} disabled={!label.trim() || !effectiveCode}>
                Add
              </Button>
            </div>
            <p className="text-caption text-text-secondary">
              New rungs go to the end of the ladder — move it into place with the arrows below. The code is what
              gets stored on every course and every student preference, and it can never be changed afterwards.
            </p>
            {createLevel.isError && <p className="text-body-sm text-error">{createLevel.error.message}</p>}
          </form>
        </Card>

        <Table
          columns={columns}
          rows={rows}
          rowKey={(row) => row.code}
          loading={levels.isLoading}
          error={levels.isError ? levels.error.message : undefined}
          emptyMessage="No study levels yet."
          filters={<Badge color="secondary">{rows.filter((r) => r.active !== false).length} offered</Badge>}
        />
      </div>
    </AdminShell>
  )
}

function RowActions({ level }: { level: StudyLevel }) {
  const [renaming, setRenaming] = useState(false)
  return (
    <div className="flex items-center justify-end gap-sm">
      <button onClick={() => setRenaming(true)} className="text-caption text-primary hover:underline">
        Rename
      </button>
      <RetireLevelTrigger level={level} />
      {renaming && <RenameLevelModal level={level} onClose={() => setRenaming(false)} />}
    </div>
  )
}
