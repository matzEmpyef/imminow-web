import { fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { describe, expect, it } from 'vitest'
import { MoneyField } from './MoneyField'

function Harness({ start = '', error }: { start?: string; error?: string }) {
  const [value, setValue] = useState(start)
  return <MoneyField label="Amount" value={value} onChange={(e) => setValue(e.target.value)} error={error} />
}

// Owner's ruling 2026-10-10: money has at most two decimal places, in every currency.
describe('MoneyField', () => {
  it('is a number field in hundredths', () => {
    render(<Harness />)
    expect(screen.getByLabelText('Amount')).toHaveAttribute('type', 'number')
    expect(screen.getByLabelText('Amount')).toHaveAttribute('step', '0.01')
  })

  it('says "Amounts have at most two decimal places." once a third decimal is typed', () => {
    render(<Harness />)
    const field = screen.getByLabelText('Amount')
    fireEvent.change(field, { target: { value: '12.34' } })
    expect(screen.queryByText('Amounts have at most two decimal places.')).toBeNull()
    fireEvent.change(field, { target: { value: '12.345' } })
    expect(screen.getByText('Amounts have at most two decimal places.')).toBeInTheDocument()
    expect(field).toHaveAttribute('aria-invalid', 'true')
  })

  it('treats a trailing zero as fine: 12.340 is not a third decimal', () => {
    render(<Harness start="12.340" />)
    expect(screen.queryByText('Amounts have at most two decimal places.')).toBeNull()
    expect(screen.getByLabelText('Amount')).not.toHaveAttribute('aria-invalid', 'true')
  })

  it('shows the server’s own sentence for the field when there is no decimals problem', () => {
    render(<Harness start="12.30" error="Amount must be more than zero." />)
    expect(screen.getByText('Amount must be more than zero.')).toBeInTheDocument()
  })

  it('puts the decimals rule first: it describes what is typed now', () => {
    render(<Harness start="12.345" error="Amount must be more than zero." />)
    expect(screen.getByText('Amounts have at most two decimal places.')).toBeInTheDocument()
    expect(screen.queryByText('Amount must be more than zero.')).toBeNull()
  })

  it('allows a smaller minimum where zero is a real amount', () => {
    render(<MoneyField label="Amount" allowZero value="" onChange={() => {}} />)
    expect(screen.getByLabelText('Amount')).toHaveAttribute('min', '0')
  })
})
