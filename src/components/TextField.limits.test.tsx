import { fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { describe, expect, it } from 'vitest'
import { TextField } from './TextField'
import { TextAreaField } from './TextAreaField'
import { MoneyField } from './MoneyField'
import { MONEY_SENTENCE, NAME_SENTENCE } from '@/lib/validation'

function Field(props: Partial<React.ComponentProps<typeof TextField>> & { start?: string }) {
  const { start = '', ...rest } = props
  const [value, setValue] = useState(start)
  return <TextField label="Field" value={value} onChange={(e) => setValue(e.target.value)} {...rest} />
}

function Area(props: Partial<React.ComponentProps<typeof TextAreaField>> & { start?: string }) {
  const { start = '', ...rest } = props
  const [value, setValue] = useState(start)
  return <TextAreaField label="Area" value={value} onChange={(e) => setValue(e.target.value)} {...rest} />
}

// Phase 9, decision 154: the shared inputs carry the limits, the counter and the sentence.
describe('TextField limits', () => {
  it('stops a name at 100 characters', () => {
    render(<Field kind="name" />)
    const input = screen.getByLabelText('Field') as HTMLInputElement
    fireEvent.change(input, { target: { value: 'a'.repeat(120) } })
    expect(input.value).toHaveLength(100)
  })

  it('counts characters, not UTF-16 units: 100 emoji fit in a label', () => {
    render(<Field kind="label" />)
    const input = screen.getByLabelText('Field') as HTMLInputElement
    fireEvent.change(input, { target: { value: '😀'.repeat(120) } })
    expect(Array.from(input.value)).toHaveLength(100)
  })

  it('gives a plain text field a ceiling of 200 when it names no kind', () => {
    render(<Field />)
    const input = screen.getByLabelText('Field') as HTMLInputElement
    fireEvent.change(input, { target: { value: 'b'.repeat(250) } })
    expect(input.value).toHaveLength(200)
  })

  it('shows the counter from 90% of the limit, not before', () => {
    render(<Field kind="name" />)
    const input = screen.getByLabelText('Field')
    fireEvent.change(input, { target: { value: 'a'.repeat(89) } })
    expect(screen.queryByText('89 / 100')).toBeNull()
    fireEvent.change(input, { target: { value: 'a'.repeat(90) } })
    expect(screen.getByText('90 / 100')).toBeInTheDocument()
    fireEvent.change(input, { target: { value: 'a'.repeat(100) } })
    expect(screen.getByText('100 / 100')).toBeInTheDocument()
  })

  it('drops a NUL typed or pasted into the field', () => {
    render(<Field />)
    const input = screen.getByLabelText('Field') as HTMLInputElement
    fireEvent.change(input, { target: { value: 'ab\u0000cd' } })
    expect(input.value).toBe('abcd')
  })

  it('says the name sentence once the field is left with digits in it', () => {
    render(<Field kind="name" />)
    const input = screen.getByLabelText('Field')
    fireEvent.change(input, { target: { value: 'Asha2' } })
    expect(screen.queryByText(NAME_SENTENCE)).toBeNull()
    fireEvent.blur(input)
    expect(screen.getByText(NAME_SENTENCE)).toBeInTheDocument()
    expect(input).toHaveAttribute('aria-invalid', 'true')
  })

  it('accepts a name in an Indian script', () => {
    render(<Field kind="name" />)
    const input = screen.getByLabelText('Field')
    fireEvent.change(input, { target: { value: 'ஆஷா ராவ்' } })
    fireEvent.blur(input)
    expect(screen.queryByText(NAME_SENTENCE)).toBeNull()
  })

  it('upper-cases a code as it is typed and stops at the end of its range', () => {
    render(<Field kind="code" codeRange={{ min: 6, max: 20 }} />)
    const input = screen.getByLabelText('Field') as HTMLInputElement
    fireEvent.change(input, { target: { value: 'abc-12' } })
    expect(input.value).toBe('ABC-12')
    fireEvent.change(input, { target: { value: 'a'.repeat(30) } })
    expect(input.value).toHaveLength(20)
  })

  it('says why a code is too short once the field is left', () => {
    render(<Field kind="code" codeRange={{ min: 6, max: 20 }} />)
    const input = screen.getByLabelText('Field')
    fireEvent.change(input, { target: { value: 'abc' } })
    fireEvent.blur(input)
    expect(screen.getByText('Use 6 to 20 letters, digits or dashes.')).toBeInTheDocument()
  })

  it('lower-cases an email and stops it at 254 characters', () => {
    render(<Field type="email" />)
    const input = screen.getByLabelText('Field') as HTMLInputElement
    fireEvent.change(input, { target: { value: 'Asha@Example.com' } })
    expect(input.value).toBe('asha@example.com')
    fireEvent.change(input, { target: { value: `${'a'.repeat(300)}@example.com` } })
    expect(input.value).toHaveLength(254)
  })

  it('says the email sentence once an email field is left with something that is not one', () => {
    render(<Field type="email" />)
    const input = screen.getByLabelText('Field')
    fireEvent.change(input, { target: { value: 'asha@' } })
    fireEvent.blur(input)
    expect(screen.getByText('Enter a valid email address.')).toBeInTheDocument()
  })

  it('lets a form’s own sentence win over the shared one', () => {
    render(<Field kind="name" error="That name is taken." />)
    const input = screen.getByLabelText('Field')
    fireEvent.change(input, { target: { value: 'Asha2' } })
    fireEvent.blur(input)
    expect(screen.getByText('That name is taken.')).toBeInTheDocument()
    expect(screen.queryByText(NAME_SENTENCE)).toBeNull()
  })

  it('keeps a date between 1900 and 2100', () => {
    render(<Field type="date" />)
    const input = screen.getByLabelText('Field')
    expect(input).toHaveAttribute('min', '1900-01-01')
    expect(input).toHaveAttribute('max', '2100-12-31')
    fireEvent.change(input, { target: { value: '2150-01-01' } })
    fireEvent.blur(input)
    expect(screen.getByText('Enter a date between 1900 and 2100.')).toBeInTheDocument()
  })

  it('lets a form narrow the date range with its own min and max', () => {
    render(<Field type="date" min="2026-10-01" max="2026-12-31" />)
    const input = screen.getByLabelText('Field')
    expect(input).toHaveAttribute('min', '2026-10-01')
    expect(input).toHaveAttribute('max', '2026-12-31')
  })

  it('holds a percentage to 0 to 100', () => {
    render(<Field kind="percent" type="number" />)
    const input = screen.getByLabelText('Field')
    expect(input).toHaveAttribute('max', '100')
    expect(input).toHaveAttribute('step', '0.01')
    fireEvent.change(input, { target: { value: '120' } })
    fireEvent.blur(input)
    expect(screen.getByText('Enter a percentage from 0 to 100, with at most two decimal places.')).toBeInTheDocument()
  })

  it('holds a count to whole numbers up to its ceiling', () => {
    render(<Field kind="count" type="number" countMax={100} />)
    const input = screen.getByLabelText('Field')
    fireEvent.change(input, { target: { value: '101' } })
    fireEvent.blur(input)
    expect(screen.getByText('Enter a whole number from 0 to 100.')).toBeInTheDocument()
  })

  it('does not trim or reshape a password but stops it at 256 characters', () => {
    render(<Field type="password" />)
    const input = screen.getByLabelText('Field') as HTMLInputElement
    fireEvent.change(input, { target: { value: '  spaced  ' } })
    expect(input.value).toBe('  spaced  ')
    fireEvent.change(input, { target: { value: 'p'.repeat(300) } })
    expect(input.value).toHaveLength(256)
  })
})

describe('TextAreaField limits', () => {
  it('stops long text at 5000 characters by default', () => {
    render(<Area />)
    const area = screen.getByLabelText('Area') as HTMLTextAreaElement
    fireEvent.change(area, { target: { value: 'x'.repeat(5200) } })
    expect(area.value).toHaveLength(5000)
    expect(screen.getByText('5000 / 5000')).toBeInTheDocument()
  })

  it('stops a reason at 2000 and chat at 4000', () => {
    const { unmount } = render(<Area kind="reason" />)
    const reason = screen.getByLabelText('Area') as HTMLTextAreaElement
    fireEvent.change(reason, { target: { value: 'x'.repeat(2100) } })
    expect(reason.value).toHaveLength(2000)
    unmount()
    render(<Area kind="chat" />)
    const chat = screen.getByLabelText('Area') as HTMLTextAreaElement
    fireEvent.change(chat, { target: { value: 'x'.repeat(4100) } })
    expect(chat.value).toHaveLength(4000)
  })

  it('shows the counter from 90%', () => {
    render(<Area kind="reason" />)
    const area = screen.getByLabelText('Area')
    fireEvent.change(area, { target: { value: 'x'.repeat(1799) } })
    expect(screen.queryByText('1799 / 2000')).toBeNull()
    fireEvent.change(area, { target: { value: 'x'.repeat(1800) } })
    expect(screen.getByText('1800 / 2000')).toBeInTheDocument()
  })

  it('says 3 to 2000 for a reason that is too short once it is left', () => {
    render(<Area kind="reason" />)
    const area = screen.getByLabelText('Area')
    fireEvent.change(area, { target: { value: 'ok' } })
    fireEvent.blur(area)
    expect(screen.getByText('Enter 3 to 2000 characters.')).toBeInTheDocument()
  })

  it('refuses text of only spaces with its own sentence', () => {
    render(<Area kind="reason" />)
    const area = screen.getByLabelText('Area')
    fireEvent.change(area, { target: { value: '     ' } })
    fireEvent.blur(area)
    expect(screen.getByText('Enter some text, not only spaces.')).toBeInTheDocument()
  })

  it('keeps a form’s own maxLength as its limit', () => {
    render(<Area maxLength={500} />)
    const area = screen.getByLabelText('Area') as HTMLTextAreaElement
    fireEvent.change(area, { target: { value: 'x'.repeat(600) } })
    expect(area.value).toHaveLength(500)
  })
})

describe('MoneyField limits', () => {
  function Money({ allowZero, start = '' }: { allowZero?: boolean; start?: string }) {
    const [value, setValue] = useState(start)
    return <MoneyField label="Amount" value={value} allowZero={allowZero} onChange={(e) => setValue(e.target.value)} />
  }

  it('says the amount sentence for zero unless zero is allowed', () => {
    const { unmount } = render(<Money start="0" />)
    expect(screen.getByText(MONEY_SENTENCE)).toBeInTheDocument()
    unmount()
    render(<Money start="0" allowZero />)
    expect(screen.queryByText(MONEY_SENTENCE)).toBeNull()
  })

  it('refuses an amount above 99,99,99,999.99 (the server limit)', () => {
    render(<Money start="1000000000" />)
    expect(screen.getByText(MONEY_SENTENCE)).toBeInTheDocument()
    expect(screen.getByLabelText('Amount')).toHaveAttribute('max', '999999999.99')
  })
})
