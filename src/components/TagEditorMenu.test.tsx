import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { TagEditorMenu } from './TagEditorMenu'

// The tag editor on leads, clients and library documents can create a tag on the fly. At the
// consultancy's tag ceiling (product owner, 2026-09-25) it still picks existing tags but won't
// create one, and says why; a create the server refuses shows the server's reason.
const CATALOG = [{ id: 't1', name: 'Hot' }]

function openEditor(props: Partial<Parameters<typeof TagEditorMenu>[0]> = {}) {
  const onCreateTag = props.onCreateTag ?? vi.fn().mockResolvedValue({})
  render(
    <TagEditorMenu tags={[]} catalog={CATALOG} onSave={vi.fn()} onCreateTag={onCreateTag} label="Edit tags" {...props} />,
  )
  fireEvent.click(screen.getByRole('button', { name: 'Edit tags' }))
  return { dialog: screen.getByRole('dialog', { name: 'Edit tags' }), onCreateTag }
}

function typeTag(dialog: HTMLElement, name: string) {
  const input = within(dialog).getByLabelText('Add a tag')
  fireEvent.focus(input)
  fireEvent.change(input, { target: { value: name } })
  fireEvent.keyDown(input, { key: 'Enter' })
}

describe('TagEditorMenu at the tag ceiling', () => {
  it('refuses a NEW name with the reason, without calling the server', async () => {
    const { dialog, onCreateTag } = openEditor({ createBlockedReason: "You've reached the 100-tag limit." })
    expect(within(dialog).getByText(/You can still pick an existing tag/)).toBeInTheDocument()

    typeTag(dialog, 'Brand new')
    expect(await within(dialog).findByRole('alert')).toHaveTextContent("You've reached the 100-tag limit.")
    expect(onCreateTag).not.toHaveBeenCalled()
    expect(within(dialog).queryByText('Brand new')).not.toBeInTheDocument()
  })

  it('still adds an existing tag', async () => {
    const { dialog, onCreateTag } = openEditor({ createBlockedReason: "You've reached the 100-tag limit." })
    typeTag(dialog, 'Hot')
    await waitFor(() => expect(within(dialog).getByRole('button', { name: 'Remove Hot' })).toBeInTheDocument())
    expect(onCreateTag).not.toHaveBeenCalled()
  })

  it("shows the server's reason when a create is refused", async () => {
    const onCreateTag = vi.fn().mockRejectedValue(new Error('A consultancy can hold at most 100 tags.'))
    const { dialog } = openEditor({ onCreateTag })
    typeTag(dialog, 'Brand new')
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('A consultancy can hold at most 100 tags.')
  })
})
