// Split out of ConsultancyProfilePage.tsx (Phase 3 plan, Tier B2, 2026-09-03) — pure movement, no logic change.
import { useState, type FormEvent } from 'react'
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

export function TagManagementTab() {
  const tags = useTags()
  const createTag = useCreateTag()
  const [name, setName] = useState('')

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!name) return
    createTag.mutate(name, { onSuccess: () => setName('') })
  }

  return (
    <>
      <p className="text-body-sm text-text-secondary">Tags applied to leads and clients, filterable in list views.</p>

      <Card className="max-w-[32rem]">
        <form onSubmit={handleSubmit} className="flex items-end gap-sm">
          <TextField label="New tag" value={name} onChange={(e) => setName(e.target.value)} className="flex-1" />
          <Button type="submit" loading={createTag.isPending} disabled={!name}>
            Add
          </Button>
        </form>
        {createTag.isError && <p className="mt-sm text-body-sm text-error">{createTag.error.message}</p>}
      </Card>

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
