// Split out of ConsultancyProfilePage.tsx (Phase 3 plan, Tier B2, 2026-09-03) — pure movement, no logic change.
import { useState, type FormEvent } from 'react'
import { Plus } from 'lucide-react'
import { Card } from '@/components/Card'
import { Button } from '@/components/Button'
import { Badge } from '@/components/Badge'
import { TextField } from '@/components/TextField'
import { Modal } from '@/components/Modal'
import { useCreateTag, useDeleteTag, useTags } from '@/queries/tags'

// User-requested (2026-08-15) — "wherever there is delete, confirm popup is needed." Was a bare
// ✕ that removed the tag immediately.
function DeleteTagTrigger({ tagId, tagName }: { tagId: string; tagName: string }) {
  const deleteTag = useDeleteTag()
  const [confirming, setConfirming] = useState(false)

  return (
    <>
      <button
        onClick={() => setConfirming(true)}
        className="text-caption text-error hover:underline"
        aria-label={`Delete ${tagName}`}
      >
        ✕
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
    createTag.mutate(name.trim(), { onSuccess: onClose })
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
      <div className="flex max-w-[32rem] items-center justify-between gap-md">
        <p className="text-body-sm text-text-secondary">Tags applied to leads and clients, filterable in list views.</p>
        <Button onClick={() => setAdding(true)} className="inline-flex shrink-0 items-center gap-xs">
          <Plus className="h-4 w-4" aria-hidden />
          Add tag
        </Button>
      </div>
      {adding && <AddTagModal onClose={() => setAdding(false)} />}

      <Card className="max-w-[32rem]">
        {tags.isLoading && <p className="text-body-sm text-text-secondary">Loading…</p>}
        {tags.data?.length === 0 && <p className="text-body-sm text-text-secondary">No tags yet.</p>}
        <div className="flex flex-wrap gap-sm">
          {tags.data?.map((tag) => (
            <div key={tag.id} className="flex items-center gap-xs">
              <Badge color="secondary">{tag.name}</Badge>
              <DeleteTagTrigger tagId={tag.id} tagName={tag.name} />
            </div>
          ))}
        </div>
      </Card>
    </>
  )
}
