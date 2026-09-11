// Split out of ConsultancyProfilePage.tsx (Phase 3 plan, Tier B2, 2026-09-03) — pure movement, no logic change.
import { useState, type FormEvent } from 'react'
import { Plus, X } from 'lucide-react'
import { Card } from '@/components/Card'
import { Button } from '@/components/Button'
import { TextField } from '@/components/TextField'
import { Modal } from '@/components/Modal'
import { useCreateTag, useDeleteTag, useTags } from '@/queries/tags'
import { showToast } from '@/lib/toast'

// User-requested (2026-08-15) — "wherever there is delete, confirm popup is needed." Was a bare
// ✕ that removed the tag immediately.
function DeleteTagTrigger({ tagId, tagName }: { tagId: string; tagName: string }) {
  const deleteTag = useDeleteTag()
  const [confirming, setConfirming] = useState(false)

  return (
    <>
      <button
        type="button"
        onClick={() => setConfirming(true)}
        className="flex h-5 w-5 items-center justify-center rounded-full text-text-secondary hover:bg-error/10 hover:text-error"
        aria-label={`Delete ${tagName}`}
        title="Delete tag"
      >
        <X className="h-3 w-3" />
      </button>
      {confirming && (
        <Modal
          onClose={() => setConfirming(false)}
          title="Delete Tag"
          widthRem={24}
          footer={
            <div className="flex justify-end gap-sm">
              <Button variant="secondary" onClick={() => setConfirming(false)}>
                Cancel
              </Button>
              <Button
                variant="destructive"
                loading={deleteTag.isPending}
                onClick={() => deleteTag.mutate(tagId, { onSuccess: () => setConfirming(false) })}
              >
                Delete
              </Button>
            </div>
          }
        >
          <p className="text-body-sm text-text-secondary">
            Delete <span className="font-medium text-text-primary">{tagName}</span>? It won't be offered for new
            tagging, but leads and clients already tagged with it keep it.
          </p>
        </Modal>
      )}
    </>
  )
}

// Adding a tag happens in a popup (user, 2026-09-10: "use popup to add not inline"), same as every
// other "add" on this console, instead of a form row permanently occupying the top of the tab.
function AddTagModal({ onClose }: { onClose: () => void }) {
  const createTag = useCreateTag()
  const [name, setName] = useState('')

  function handleSubmit(e?: FormEvent) {
    e?.preventDefault()
    if (!name.trim()) return
    const trimmed = name.trim()
    createTag.mutate(trimmed, {
      onSuccess: () => {
        showToast(`${trimmed} tag added`)
        onClose()
      },
    })
  }

  return (
    <Modal
      onClose={onClose}
      title="Add tag"
      widthRem={26}
      footer={
        <div className="flex justify-end gap-sm">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={() => handleSubmit()} loading={createTag.isPending} disabled={!name.trim()}>
            Add tag
          </Button>
        </div>
      }
    >
      <form onSubmit={handleSubmit} className="flex flex-col gap-sm">
        <TextField label="Tag name" required value={name} onChange={(e) => setName(e.target.value)} />
        <p className="text-caption text-text-secondary">Tags apply to leads and clients and can be filtered on in lists.</p>
        {createTag.isError && <p className="text-body-sm text-error">{createTag.error.message}</p>}
      </form>
    </Modal>
  )
}

export function TagManagementTab() {
  const tags = useTags()
  const [adding, setAdding] = useState(false)

  return (
    <>
      <div className="flex items-center justify-between gap-md">
        <p className="text-body-sm text-text-secondary">Tags applied to leads and clients, filterable in list views.</p>
        <Button onClick={() => setAdding(true)} className="inline-flex shrink-0 items-center gap-xs">
          <Plus className="h-4 w-4" aria-hidden />
          Add tag
        </Button>
      </div>
      {adding && <AddTagModal onClose={() => setAdding(false)} />}

      <Card>
        <div className="flex items-center justify-between gap-md">
          <h2 className="text-h3 text-text-primary">Tags</h2>
          {tags.data && tags.data.length > 0 && (
            <span className="text-body-sm tabular-nums text-text-secondary">{tags.data.length}</span>
          )}
        </div>
        {tags.isLoading && <p className="mt-sm text-body-sm text-text-secondary">Loading…</p>}
        {tags.data?.length === 0 && (
          <p className="mt-sm text-body-sm text-text-secondary">No tags yet — use Add tag to create your first.</p>
        )}
        {/* Each tag a chip with its delete inside it, rather than a badge and a loose ✕ beside it. */}
        <div className="mt-sm flex flex-wrap gap-sm">
          {tags.data?.map((tag) => (
            <span
              key={tag.id}
              className="inline-flex items-center gap-xs rounded-full border border-border bg-background py-0.5 pl-sm pr-0.5 text-body-sm text-text-primary"
            >
              {tag.name}
              <DeleteTagTrigger tagId={tag.id} tagName={tag.name} />
            </span>
          ))}
        </div>
      </Card>
    </>
  )
}
