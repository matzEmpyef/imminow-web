import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ReactNode } from 'react'

// The platform's case view shows the student's email and phone as plain text on its Contact card
// (not a table), so it carries the same copy control as the other detail views (owner, 2026-10-06).
vi.mock('@/features/auth/AdminShell', () => ({
  AdminShell: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}))
vi.mock('@/api/client', () => ({ api: { GET: vi.fn() } }))
vi.mock('@/queries/caseFollowups', () => ({
  useCaseNotes: vi.fn(),
  useRecordFollowup: vi.fn(),
}))

import { api } from '@/api/client'
import { useCaseNotes, useRecordFollowup } from '@/queries/caseFollowups'
import { useAuthStore } from '@/stores/authStore'
import { ApplicantCaseViewPage } from './ApplicantCaseViewPage'

function applicant(student: Record<string, unknown>) {
  return {
    data: {
      id: 'j1',
      status: 'in_plan',
      created_at: '2026-09-01T00:00:00Z',
      days_since_started: 5,
      student: { name: 'Aiko Tanaka', ...student },
      applications: [],
      plans: [],
      commission: null,
      signals: [],
    },
    error: undefined,
  }
}

function renderPage() {
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter initialEntries={['/admin/applicants/j1']}>
        <Routes>
          <Route path="/admin/applicants/:id" element={<ApplicantCaseViewPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  useAuthStore.setState({ accessToken: 'test-token' })
  vi.mocked(useCaseNotes).mockReturnValue({ data: [], isLoading: false, isError: false, refetch: vi.fn() } as never)
  vi.mocked(useRecordFollowup).mockReturnValue({ mutate: vi.fn(), isPending: false, isError: false } as never)
})

describe('ApplicantCaseViewPage contact card', () => {
  it('puts a copy button beside the email and the phone number', async () => {
    vi.mocked(api.GET).mockResolvedValue(applicant({ email: 'aiko@example.com', phone: '+91 98765 43210' }) as never)
    renderPage()
    expect(await screen.findByText('aiko@example.com')).toBeTruthy()
    expect(screen.getByText('+91 98765 43210')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Copy email address' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Copy phone number' })).toBeTruthy()
  })

  it('offers no phone copy button when there is no phone number', async () => {
    vi.mocked(api.GET).mockResolvedValue(applicant({ email: 'aiko@example.com', phone: null }) as never)
    renderPage()
    expect(await screen.findByText('aiko@example.com')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Copy email address' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Copy phone number' })).toBeNull()
  })
})

// 2026-10-08: each plan carries its own name, so a case with several plans shows which is which.
describe('ApplicantCaseViewPage plans', () => {
  it('shows each plan by its name, beside what it belongs to', async () => {
    const answer = applicant({})
    vi.mocked(api.GET).mockResolvedValue({
      ...answer,
      data: {
        ...answer.data,
        plans: [
          { id: 'p1', name: 'Canada visa plan', scope: 'case', college_name: null, progress: '2/5' },
          { id: 'p2', name: 'Admission steps', scope: 'college', college_name: 'Maple College', progress: '0/3' },
        ],
      },
    } as never)
    renderPage()

    expect(await screen.findByText('Canada visa plan')).toBeInTheDocument()
    expect(screen.getByText('Case plan')).toBeInTheDocument()
    expect(screen.getByText('Admission steps')).toBeInTheDocument()
    expect(screen.getByText('Maple College')).toBeInTheDocument()
  })
})
