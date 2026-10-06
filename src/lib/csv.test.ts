import { describe, expect, it } from 'vitest'
import { csvCell, toCsv } from './csv'

// Review F-145. A spreadsheet program runs a cell that begins with a formula character. Names and
// free text reach every export, so the one shared helper makes such a cell plain text, and every
// export goes through that helper.
describe('a text cell that would run as a formula', () => {
  it.each([
    ['=HYPERLINK("http://evil.test","Click")', `"'=HYPERLINK(""http://evil.test"",""Click"")"`],
    ['=1+1', "'=1+1"],
    ['+SUM(A1:A9)', "'+SUM(A1:A9)"],
    ['-2+3', "'-2+3"],
    ['@SUM(1,2)', `"'@SUM(1,2)"`],
    ['\t=1+1', "'\t=1+1"],
    ['\r=1+1', `"'\r=1+1"`],
  ])('%j is written as text', (typed, written) => {
    expect(csvCell(typed)).toBe(written)
  })

  it('covers a phone number that begins with +', () => {
    expect(csvCell('+91 98765 43210')).toBe("'+91 98765 43210")
  })
})

describe('everything else is left as it was', () => {
  it('leaves a number alone, so a negative amount stays a number', () => {
    expect(csvCell(-1250.5)).toBe('-1250.5')
    expect(csvCell(0)).toBe('0')
    expect(csvCell(42)).toBe('42')
  })

  it('leaves ordinary text alone, including a formula character that is not first', () => {
    expect(csvCell('Asha Nair')).toBe('Asha Nair')
    expect(csvCell('a=b')).toBe('a=b')
    expect(csvCell('first-half')).toBe('first-half')
    expect(csvCell('asha@example.test')).toBe('asha@example.test')
  })

  it('still quotes commas, quotes and line breaks', () => {
    expect(csvCell('Nair, Asha')).toBe('"Nair, Asha"')
    expect(csvCell('She said "hi"')).toBe(`"She said ""hi"""`)
    expect(csvCell('line one\nline two')).toBe('"line one\nline two"')
  })

  it('writes nothing for a missing value', () => {
    expect(csvCell(null)).toBe('')
    expect(csvCell(undefined)).toBe('')
  })
})

describe('toCsv', () => {
  it('makes every text cell safe and keeps numbers as numbers', () => {
    const csv = toCsv(
      [{ name: '=cmd|"/c calc"!A1', amount: -500 }],
      [
        { header: 'Name', value: (r) => r.name },
        { header: 'Amount', value: (r) => r.amount },
      ],
    )
    expect(csv).toBe(`Name,Amount\r\n"'=cmd|""/c calc""!A1",-500`)
  })
})

describe('every export uses this helper', () => {
  const sources = import.meta.glob(['../features/**/*.{ts,tsx}', '../components/*.tsx', '../queries/*.ts'], {
    query: '?raw',
    import: 'default',
    eager: true,
  }) as Record<string, string>
  const files = Object.entries(sources).filter(([path]) => !path.includes('.test.'))

  it('no screen keeps its own copy of the CSV quoting or the download', () => {
    const offenders = files
      .filter(([, text]) => /function (csvCell|toCsv)\b/.test(text) || /text\/csv/.test(text))
      .map(([path]) => path)
    expect(offenders).toEqual([])
  })

  it('the three exports that had private copies now import the shared one', () => {
    for (const name of ['finance/HistoryTab.tsx', 'freelancers/PayoutHistoryTab.tsx', 'freelancer/FreelancerDashboardPage.tsx']) {
      const found = files.find(([path]) => path.endsWith(name))
      expect(found, name).toBeDefined()
      expect(found![1]).toMatch(/from '@\/lib\/csv'/)
    }
  })
})
