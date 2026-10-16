import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

// Decision 154, ruling 14: turning a blog tag off that the server refuses shows the server's sentence.
vi.mock('@/queries/blogCategoryMappings', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/queries/blogCategoryMappings')>()),
  useUpdateMapping: () => ({
    mutate: vi.fn(),
    isPending: false,
    isError: true,
    error: new Error('This tag is pinned on the home screen and cannot be turned off.'),
  }),
}))
vi.mock('@/lib/toast', () => ({ showToast: vi.fn() }))

import { MappingToggle } from './BlogAdminPage'

describe('Blog mappings: a refused change', () => {
  it("shows the server's sentence in the confirm step", () => {
    render(
      <MappingToggle
        mapping={{ id: 'm1', wp_category: 'visas', label: 'Visas', app_tag: 'visas', active: true, article_count: 3 } as never}
      />,
    )
    fireEvent.click(screen.getByRole('switch'))
    expect(screen.getByRole('alert')).toHaveTextContent('This tag is pinned on the home screen and cannot be turned off.')
    expect(screen.queryByText('Could not update this mapping.')).not.toBeInTheDocument()
  })
})
