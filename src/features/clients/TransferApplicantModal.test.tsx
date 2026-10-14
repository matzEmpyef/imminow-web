import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// The sender decides what goes with a transferred case (owner's ruling on review I-014,
// 2026-10-08): all four keys are sent, and the toast says what the server shared.
vi.mock('@/queries/clients', () => ({ useTransferApplicant: vi.fn() }))
vi.mock('@/queries/consultancy', () => ({ useMyConsultancy: () => ({ data: { id: 'mine' } }) }))
vi.mock('@/lib/toast', () => ({ showToast: vi.fn() }))
vi.mock('@/components/ServerSearchSelect', () => ({
  ServerSearchSelect: ({ onChange }: { onChange: (id: string) => void }) => (
    <button type="button" onClick={() => onChange('acc-2')}>
      Pick consultancy
    </button>
  ),
}))

import { ApiError } from '@/api/errors'
import { useTransferApplicant } from '@/queries/clients'
import { showToast } from '@/lib/toast'
import { TransferApplicantModal } from './TransferApplicantModal'

const mutate = vi.fn()

function mutation(error: Error | null = null) {
  return { mutate, isPending: false, isError: Boolean(error), error } as never
}

function open() {
  const onTransferred = vi.fn()
  render(<TransferApplicantModal clientId="c1" clientName="Asha Nair" onClose={() => {}} onTransferred={onTransferred} />)
  return { onTransferred }
}

function fillAndSubmit() {
  fireEvent.click(screen.getByRole('button', { name: 'Pick consultancy' }))
  fireEvent.change(screen.getByLabelText('Reason'), { target: { value: 'Moving city' } })
  fireEvent.change(screen.getByLabelText('Transfer code'), { target: { value: '7f2k9c1a' } })
  fireEvent.change(screen.getByPlaceholderText('TRANSFER'), { target: { value: 'TRANSFER' } })
  fireEvent.click(screen.getByRole('button', { name: 'Transfer Applicant' }))
}

beforeEach(() => {
  mutate.mockReset()
  vi.mocked(showToast).mockClear()
  vi.mocked(useTransferApplicant).mockReturnValue(mutation())
})

describe('Transfer Applicant — what moves with the case', () => {
  it('sends the documents only when nothing is changed', () => {
    open()
    fillAndSubmit()
    expect(mutate.mock.calls[0][0]).toMatchObject({
      newConsultancyId: 'acc-2',
      transferCode: '7F2K9C1A',
      carry: { documents: true, applications: false, preferences: false, chat: false, admission: false, recorded_payments: false },
    })
  })

  it('sends what was ticked, and says what the server shared', () => {
    const { onTransferred } = open()
    fireEvent.click(screen.getByRole('checkbox', { name: /College applications/ }))
    fireEvent.click(screen.getByRole('checkbox', { name: /Earlier conversation/ }))
    fillAndSubmit()
    expect(mutate.mock.calls[0][0].carry).toEqual({ documents: true, applications: true, preferences: false, chat: true, admission: false, recorded_payments: false })

    mutate.mock.calls[0][1].onSuccess({ status: 'transferred', carried: ['documents', 'applications'] })
    expect(showToast).toHaveBeenCalledWith('Moved. Shared: documents, college applications.')
    expect(onTransferred).toHaveBeenCalled()
  })

  it('says so when nothing was shared', () => {
    open()
    fireEvent.click(screen.getByRole('checkbox', { name: /Documents/ }))
    fillAndSubmit()
    expect(mutate.mock.calls[0][0].carry).toEqual({ documents: false, applications: false, preferences: false, chat: false, admission: false, recorded_payments: false })
    mutate.mock.calls[0][1].onSuccess({ status: 'transferred', carried: [] })
    expect(showToast).toHaveBeenCalledWith('Moved. Nothing was shared.')
  })

  it('shows the server’s sentence when it refuses the selection', () => {
    vi.mocked(useTransferApplicant).mockReturnValue(
      mutation(new ApiError('x', { error: { code: 'validation_failed', message: 'Each carry value must be true or false.' } }, 400)),
    )
    open()
    expect(screen.getByText('Each carry value must be true or false.')).toBeInTheDocument()
  })
})
