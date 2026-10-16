import { describe, expect, it } from 'vitest'
import {
  CHAT_MAX,
  COUNT_MAX,
  DATE_RANGE_SENTENCE,
  DATE_SENTENCE,
  EMAIL_ERROR,
  EXCHANGE_RATE_SENTENCE,
  INDIA_PHONE_SENTENCE,
  MONEY_DECIMALS_ERROR,
  MONEY_OR_ZERO_SENTENCE,
  MONEY_SENTENCE,
  NAME_SENTENCE,
  PERCENT_SENTENCE,
  REFERRAL_CODE_LENGTH,
  SPACES_ONLY_SENTENCE,
  STAFF_PHONE_SENTENCE,
  URL_SENTENCE,
  VENUE_CODE_LENGTH,
  charLength,
  checkText,
  cleanName,
  cleanPayload,
  cleanText,
  clipChars,
  clipGraphemes,
  codeError,
  countError,
  dateError,
  dateOfBirthError,
  dateRangeError,
  emailError,
  exchangeRateError,
  fieldKindError,
  fieldKindLimit,
  firstChar,
  isValidEmail,
  isValidHttpsUrl,
  isValidPhone,
  moneyError,
  normaliseCode,
  normaliseEmail,
  numberRangeError,
  percentError,
  phoneError,
  phoneToSend,
  readPhone,
  searchTerm,
  stripControlChars,
  nameFits,
  withSafeSearch,
  urlError,
} from './validation'

describe('counting characters', () => {
  it('counts an emoji as one character, not two', () => {
    expect('😀'.length).toBe(2)
    expect(charLength('😀')).toBe(1)
    expect(charLength('a😀b')).toBe(3)
  })

  it('counts a Devanagari word by its code points', () => {
    expect(charLength('नमस्ते')).toBe(6)
  })

  it('clips at a character boundary, never in the middle of an emoji', () => {
    expect(clipChars('😀😀😀', 2)).toBe('😀😀')
    expect(clipChars('abc', 5)).toBe('abc')
  })

  it('takes the first visible character for an initial: a letter with its vowel sign stays whole', () => {
    expect(firstChar('  asha')).toBe('A')
    expect(firstChar('आशा')).toBe('आ')
    expect(firstChar('कि')).toBe('कि')
    expect(firstChar('😀 Smile')).toBe('😀')
    expect(firstChar(null)).toBe('')
  })

  it('cuts text to a number of visible characters with an ellipsis', () => {
    expect(clipGraphemes('abcdef', 3)).toBe('abc…')
    expect(clipGraphemes('abc', 3)).toBe('abc')
    expect(clipGraphemes('किकिकिकि', 2)).toBe('किकि…')
  })
})

describe('what is sent for text', () => {
  it('trims and drops NUL and other control codes but keeps line breaks', () => {
    expect(cleanText('  hi\u0000 there \n ')).toBe('hi there')
    expect(stripControlChars('a\u0000b\tc\nd\u0007')).toBe('ab\tc\nd')
  })

  it('makes runs of spaces in a name one space', () => {
    expect(cleanName('  Asha   Rao ')).toBe('Asha Rao')
  })

  it('trims every string in a request body except passwords and tokens', () => {
    expect(
      cleanPayload({
        name: '  Asha ',
        password: '  keep me  ',
        new_password: ' x ',
        refresh_token: ' t ',
        nested: { note: ' hi ', list: [' a ', 3, null] },
      }),
    ).toEqual({
      name: 'Asha',
      password: '  keep me  ',
      new_password: ' x ',
      refresh_token: ' t ',
      nested: { note: 'hi', list: ['a', 3, null] },
    })
  })
})

describe('names', () => {
  it('accepts letters of any script, spaces, hyphens, apostrophes and full stops', () => {
    for (const name of [
      'Asha Rao',
      "D'Souza",
      'Mary-Ann',
      'Dr. A. P. J. Abdul Kalam',
      'आशा शर्मा',
      'தமிழ்செல்வி',
      'ಕನ್ನಡ ಅಕ್ಷರ',
      'ജോസഫ്',
      'José',
    ]) {
      expect(checkText('name', name)).toBeUndefined()
    }
  })

  it('refuses digits and symbols with the name sentence', () => {
    for (const name of ['Asha2', 'Asha@Rao', '123', '-Asha', 'A_B']) {
      expect(checkText('name', name)).toBe(NAME_SENTENCE)
    }
  })

  it('stops at 100 characters', () => {
    expect(checkText('name', 'a'.repeat(100))).toBeUndefined()
    expect(checkText('name', 'a'.repeat(101))).toBe(NAME_SENTENCE)
  })

  it('refuses a name of only spaces with its own sentence', () => {
    expect(checkText('name', '   ')).toBe(SPACES_ONLY_SENTENCE)
  })

  it('asks for a name when it is empty and the field is required', () => {
    expect(checkText('name', '')).toBe(NAME_SENTENCE)
    expect(checkText('name', '', { optional: true })).toBeUndefined()
  })
})

describe('titles, reasons and long text', () => {
  it('holds a label to 100 and a title to 200 characters', () => {
    expect(checkText('label', 'x'.repeat(100))).toBeUndefined()
    expect(checkText('label', 'x'.repeat(101))).toBe('Use up to 100 characters.')
    expect(checkText('title', 'x'.repeat(200))).toBeUndefined()
    expect(checkText('title', 'x'.repeat(201))).toBe('Use up to 200 characters.')
    expect(checkText('address', 'x'.repeat(201))).toBe('Use up to 200 characters.')
  })

  it('wants a reason of 3 to 2000 characters, counted after trimming', () => {
    expect(checkText('reason', '  ab  ')).toBe('Enter 3 to 2000 characters.')
    expect(checkText('reason', ' abc ')).toBeUndefined()
    expect(checkText('reason', 'x'.repeat(2000))).toBeUndefined()
    expect(checkText('reason', 'x'.repeat(2001))).toBe('Enter 3 to 2000 characters.')
    expect(checkText('reason', '   ')).toBe(SPACES_ONLY_SENTENCE)
    expect(checkText('reason', '')).toBe('Add a reason.')
  })

  it('wants a legal erasure reason of at least 20 characters', () => {
    expect(checkText('erasureReason', 'x'.repeat(19))).toBe('A legal request needs a reason of at least 20 characters.')
    expect(checkText('erasureReason', '')).toBe('Add a reason.')
    expect(checkText('erasureReason', 'x'.repeat(20))).toBeUndefined()
  })

  it('lets a note be left out but holds one that is there to 3 to 2000', () => {
    expect(checkText('note', '')).toBeUndefined()
    expect(checkText('note', 'ab')).toBe('Enter 3 to 2000 characters.')
  })

  it('stops long text at 5000 and chat at 4000', () => {
    expect(checkText('longText', 'x'.repeat(5000))).toBeUndefined()
    expect(checkText('longText', 'x'.repeat(5001))).toBe('Use up to 5000 characters.')
    expect(CHAT_MAX).toBe(4000)
    expect(checkText('chat', 'x'.repeat(4001))).toBe('A message can have up to 4000 characters.')
  })

  it('counts emoji as characters, not UTF-16 units', () => {
    expect(checkText('label', '😀'.repeat(100))).toBeUndefined()
  })
})

describe('email', () => {
  it('is trimmed and lower-cased', () => {
    expect(normaliseEmail('  Asha@Example.COM ')).toBe('asha@example.com')
  })

  it('accepts ordinary addresses and refuses the rest with one sentence', () => {
    expect(isValidEmail(' Asha@Example.com ')).toBe(true)
    expect(isValidEmail('asha.rao+tag@mail.example.co.in')).toBe(true)
    for (const bad of [
      'asha',
      'asha@',
      '@example.com',
      'asha@example',
      'a b@example.com',
      'asha@@example.com',
      'asha@example..com',
      'asha@example.c',
    ]) {
      expect(emailError(bad)).toBe(EMAIL_ERROR)
    }
    expect(emailError('')).toBeUndefined()
  })

  it('stops at 254 characters', () => {
    const local = 'a'.repeat(64)
    const long = `${local}@${'b'.repeat(190)}.com`
    expect(charLength(long)).toBeGreaterThan(254)
    expect(isValidEmail(long)).toBe(false)
    expect(isValidEmail(`${local}@${'b'.repeat(180)}.com`)).toBe(true)
  })
})

describe('phone', () => {
  it('reads a number with a country code', () => {
    expect(readPhone('+919876543210')).toEqual({ ok: true, e164: '+919876543210' })
    expect(readPhone('+91 98765-43210')).toEqual({ ok: true, e164: '+919876543210' })
    expect(readPhone('0091 9876543210')).toEqual({ ok: true, e164: '+919876543210' })
    expect(readPhone('+44 7911 123456')).toEqual({ ok: true, e164: '+447911123456' })
  })

  it('asks for the country code when a local number has no country to be read in', () => {
    expect(phoneError('9876543210')).toBe(STAFF_PHONE_SENTENCE)
  })

  it('reads a local number in the consultancy’s country', () => {
    expect(readPhone('98765 43210', '91')).toEqual({ ok: true, e164: '+919876543210' })
    expect(readPhone('09876543210', '91')).toEqual({ ok: true, e164: '+919876543210' })
    expect(phoneToSend('98765 43210', '91')).toBe('+919876543210')
  })

  it('holds a +91 number to ten digits starting 6 to 9', () => {
    for (const bad of ['+915876543210', '+91987654321', '+9198765432100', '+91 12345 67890']) {
      expect(phoneError(bad)).toBe(INDIA_PHONE_SENTENCE)
    }
    expect(phoneError('12345', '91')).toBe(INDIA_PHONE_SENTENCE)
  })

  it('refuses letters, too few and too many digits', () => {
    for (const bad of ['+91abc', 'call me', '+1234567', '+1234567890123456', '++919876543210', '91+9876543210']) {
      expect(isValidPhone(bad)).toBe(false)
    }
  })

  it('does not complain about an empty phone', () => {
    expect(phoneError('')).toBeUndefined()
  })
})

describe('money', () => {
  it('accepts 0.01 up to 99,99,99,999.99', () => {
    expect(moneyError('0.01')).toBeUndefined()
    expect(moneyError('5000')).toBeUndefined()
    expect(moneyError('999999999.99')).toBeUndefined()
    expect(moneyError('1000000000')).toBe(MONEY_SENTENCE)
  })

  it('refuses zero unless there is a "no charge" choice', () => {
    expect(moneyError('0')).toBe(MONEY_SENTENCE)
    expect(moneyError('0', { allowZero: true })).toBeUndefined()
    expect(moneyError('-1', { allowZero: true })).toBe(MONEY_OR_ZERO_SENTENCE)
  })

  it('refuses more than the maximum and a third decimal', () => {
    expect(moneyError('10000000000')).toBe(MONEY_SENTENCE)
    expect(moneyError('1.234')).toBe(MONEY_DECIMALS_ERROR)
    expect(moneyError('1.230')).toBeUndefined()
  })

  it('leaves empty to the form', () => {
    expect(moneyError('')).toBeUndefined()
    expect(moneyError(undefined)).toBeUndefined()
  })
})

describe('percentages and counts', () => {
  it('accepts 0 to 100 with two decimals', () => {
    expect(percentError('0')).toBeUndefined()
    expect(percentError('100')).toBeUndefined()
    expect(percentError('12.5')).toBeUndefined()
    expect(percentError('100.01')).toBe(PERCENT_SENTENCE)
    expect(percentError('-1')).toBe(PERCENT_SENTENCE)
    expect(percentError('12.345')).toBe(PERCENT_SENTENCE)
  })

  it('wants whole numbers within the ceiling', () => {
    expect(countError('1000000')).toBeUndefined()
    expect(COUNT_MAX).toBe(1_000_000)
    expect(countError('1000001')).toBe('Enter a whole number from 0 to 10,00,000.')
    expect(countError('2.5')).toBeDefined()
    expect(countError('-1')).toBeDefined()
    expect(countError('100001', { max: 100_000 })).toBe('Enter a whole number from 0 to 1,00,000.')
    expect(countError('100', { min: 0, max: 99 })).toBe('Enter a whole number from 0 to 99.')
  })

  it('holds a number with no range of its own to the whole-number ceiling', () => {
    expect(numberRangeError('2147483647')).toBeUndefined()
    expect(numberRangeError('2147483648')).toBeDefined()
    expect(numberRangeError('5', 10, 20)).toBe('Enter a number from 10 to 20.')
  })
})

describe('dates', () => {
  it('accepts 1900 to 2100 and refuses the rest', () => {
    expect(dateError('1900-01-01')).toBeUndefined()
    expect(dateError('2100-12-31')).toBeUndefined()
    expect(dateError('1899-12-31')).toBe(DATE_SENTENCE)
    expect(dateError('2101-01-01')).toBe(DATE_SENTENCE)
    expect(dateError('0001-01-01')).toBe(DATE_SENTENCE)
    expect(dateError('9999-12-31')).toBe(DATE_SENTENCE)
    expect(dateError('20000-01-01')).toBe(DATE_SENTENCE)
    expect(dateError('2026-02-30')).toBe(DATE_SENTENCE)
    expect(dateError('2026-10-16T10:30')).toBeUndefined()
  })

  it('wants the end on or after the start', () => {
    expect(dateRangeError('2026-10-16', '2026-10-16')).toBeUndefined()
    expect(dateRangeError('2026-10-16', '2026-10-17')).toBeUndefined()
    expect(dateRangeError('2026-10-16', '2026-10-15')).toBe(DATE_RANGE_SENTENCE)
    expect(dateRangeError('2026-10-16T10:00', '2026-10-16T09:00')).toBe(DATE_RANGE_SENTENCE)
    expect(dateRangeError('', '2026-10-15')).toBeUndefined()
    expect(dateRangeError('2026-10-16', '')).toBeUndefined()
  })

  it('wants a date of birth from 1900 up to today', () => {
    expect(dateOfBirthError('2000-05-05')).toBeUndefined()
    expect(dateOfBirthError('1899-12-31')).toBeDefined()
    expect(dateOfBirthError('2999-01-01')).toBeDefined()
    expect(dateOfBirthError('')).toBeUndefined()
  })
})

describe('codes and web links', () => {
  it('upper-cases a code and checks its length and characters', () => {
    expect(normaliseCode(' ab-12 ')).toBe('AB-12')
    expect(codeError('abc', REFERRAL_CODE_LENGTH)).toBeDefined()
    expect(codeError('abcd', REFERRAL_CODE_LENGTH)).toBeUndefined()
    expect(codeError('a'.repeat(20), REFERRAL_CODE_LENGTH)).toBeUndefined()
    expect(codeError('a'.repeat(21), REFERRAL_CODE_LENGTH)).toBe('Use 4 to 20 letters, digits or dashes.')
    expect(codeError('ab cd', REFERRAL_CODE_LENGTH)).toBeDefined()
    expect(codeError('abcde', VENUE_CODE_LENGTH)).toBe('Use 6 to 20 letters, digits or dashes.')
    expect(codeError('abc-12', VENUE_CODE_LENGTH)).toBeUndefined()
  })

  it('takes https addresses only, up to 2048 characters', () => {
    expect(isValidHttpsUrl('https://example.com/a?b=1')).toBe(true)
    for (const bad of [
      'http://example.com',
      'example.com',
      'ftp://example.com',
      'javascript:alert(1)',
      'https://',
      'https://exa mple.com',
      'https://localhost',
    ]) {
      expect(urlError(bad)).toBe(URL_SENTENCE)
    }
    expect(isValidHttpsUrl(`https://example.com/${'a'.repeat(2030)}`)).toBe(false)
    expect(urlError('')).toBeUndefined()
  })
})

describe('field kinds', () => {
  it('give each kind its limit', () => {
    expect(fieldKindLimit('name')).toBe(100)
    expect(fieldKindLimit('title')).toBe(200)
    expect(fieldKindLimit('email')).toBe(254)
    expect(fieldKindLimit('url')).toBe(2048)
    expect(fieldKindLimit('search')).toBe(100)
    expect(fieldKindLimit('code', { codeRange: VENUE_CODE_LENGTH })).toBe(20)
  })

  it('give each kind its sentence', () => {
    expect(fieldKindError('name', 'Asha2')).toBe(NAME_SENTENCE)
    expect(fieldKindError('email', 'x')).toBe(EMAIL_ERROR)
    expect(fieldKindError('percent', '101')).toBe(PERCENT_SENTENCE)
    expect(fieldKindError('name', '')).toBeUndefined()
  })
})

describe('search terms', () => {
  it('sends nothing below two characters, trims, and cuts at 100', () => {
    expect(searchTerm('')).toBeUndefined()
    expect(searchTerm(' a ')).toBeUndefined()
    expect(searchTerm('  ab ')).toBe('ab')
    expect(searchTerm('x'.repeat(150))).toHaveLength(100)
    expect(searchTerm('😀')).toBeUndefined()
    expect(searchTerm('😀😀')).toBe('😀😀')
  })

  it('leaves the other query parameters alone and drops a short search', () => {
    expect(withSafeSearch({ limit: 20, search: 'a' })).toEqual({ limit: 20 })
    expect(withSafeSearch({ limit: 20, search: ' abc ' })).toEqual({ limit: 20, search: 'abc' })
    expect(withSafeSearch({ limit: 20 })).toEqual({ limit: 20 })
    expect(withSafeSearch(undefined)).toBeUndefined()
  })
})

describe('a name in a single full-name box', () => {
  it('may run to 200 characters and follows the name rule', () => {
    expect(nameFits('a'.repeat(200))).toBe(true)
    expect(nameFits('a'.repeat(201))).toBe(false)
    expect(nameFits('सुनीता शर्मा')).toBe(true)
    expect(nameFits('Sunita 2')).toBe(false)
    expect(nameFits('   ')).toBe(false)
  })
})

describe('limits the server publishes (Phase 9 step 8)', () => {
  it('holds an amount to 999,999,999.99, as the server does', () => {
    expect(moneyError('999999999.99')).toBeUndefined()
    expect(moneyError('1000000000')).toBe(MONEY_SENTENCE)
    expect(moneyError('1000000000', { allowZero: true })).toBe(MONEY_OR_ZERO_SENTENCE)
  })

  it('holds an exchange rate above 0.0001 and below 1,00,000', () => {
    expect(exchangeRateError('0.0001')).toBe(EXCHANGE_RATE_SENTENCE)
    expect(exchangeRateError('0.00011')).toBeUndefined()
    expect(exchangeRateError('83.2')).toBeUndefined()
    expect(exchangeRateError('99999.99')).toBeUndefined()
    expect(exchangeRateError('100000')).toBe(EXCHANGE_RATE_SENTENCE)
    expect(exchangeRateError('')).toBeUndefined()
  })

  it('refuses an email whose part before the @ is over 64 characters', () => {
    expect(isValidEmail(`${'a'.repeat(64)}@example.com`)).toBe(true)
    expect(isValidEmail(`${'a'.repeat(65)}@example.com`)).toBe(false)
  })

  it('lets a phone be typed up to 32 characters', () => {
    expect(fieldKindLimit('phone')).toBe(32)
  })

  it('says a search over 100 characters the way the server does', () => {
    expect(fieldKindError('search', 'x'.repeat(101))).toBe('Searches can be up to 100 characters.')
    expect(fieldKindError('search', 'x'.repeat(100))).toBeUndefined()
  })

  it('takes a full name to 200 characters and a short line to 500', () => {
    expect(fieldKindLimit('fullName')).toBe(200)
    expect(checkText('fullName', 'a'.repeat(200))).toBeUndefined()
    expect(checkText('fullName', 'a'.repeat(201))).toBeDefined()
    expect(checkText('fullName', 'Asha 2')).toBeDefined()
    expect(checkText('name', 'a'.repeat(101))).toBe(NAME_SENTENCE)
    expect(fieldKindLimit('shortText')).toBe(500)
    expect(checkText('shortText', 'x'.repeat(500))).toBeUndefined()
    expect(checkText('shortText', 'x'.repeat(501))).toBe('Use up to 500 characters.')
  })

  it('accepts the typographic hyphen in a name and counts letters after folding to NFC', () => {
    expect(checkText('name', 'Anne‐Marie')).toBeUndefined()
    // 100 letters "e" + combining acute = 100 characters once folded (the server counts them so).
    expect(checkText('label', 'é'.repeat(100))).toBeUndefined()
  })
})
