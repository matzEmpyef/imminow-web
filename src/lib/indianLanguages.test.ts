import { describe, expect, it } from 'vitest'
import {
  FILE_PREFIX_LENGTH,
  cleanFilePrefix,
  droppedFromPrefix,
  suggestedFilePrefix,
} from './filePrefix'
import { fileNameStem } from './saveFile'
import { cleanLevelCode, slugifyLevel } from './studyLevels'
import {
  DOB_WORDS,
  EMAIL_WORDS,
  FIRST_NAME_WORDS,
  NAME_ONLY_WORDS,
  PHONE_WORDS,
  normaliseLabel,
} from './profileLabels'
import { clipGraphemes, firstChar, graphemeLength } from './validation'

// Phase 9, decision 154, ruling 13: Indian-language text is supported, not dropped.

describe('the file number prefix', () => {
  it('is the first three letters A to Z of a Latin name', () => {
    expect(suggestedFilePrefix('Blue Ocean')).toBe('BLU')
    expect(suggestedFilePrefix('  g9 consultants')).toBe('GCO')
    expect(FILE_PREFIX_LENGTH).toBe(3)
  })

  it('folds accents to their plain letter', () => {
    expect(suggestedFilePrefix('Éire Visas')).toBe('EIR')
    expect(suggestedFilePrefix('Zürich')).toBe('ZUR')
  })

  it('is empty for a name in Hindi, Tamil or Bengali: nothing can be suggested', () => {
    for (const name of ['नीला सागर', 'நீல கடல்', 'নীল সাগর', 'నీలి సముద్రం']) {
      expect(suggestedFilePrefix(name)).toBe('')
    }
  })

  it('keeps a mixed name’s Latin letters', () => {
    expect(suggestedFilePrefix('नीला Ocean')).toBe('OCE')
  })

  it('keeps only A to Z, in capitals, at most three, as it is typed', () => {
    expect(cleanFilePrefix('ab1c-d')).toBe('ABC')
    expect(cleanFilePrefix('ब')).toBe('')
  })

  it('notices a typed letter or digit it cannot hold', () => {
    expect(droppedFromPrefix('ब')).toBe(true)
    expect(droppedFromPrefix('A1')).toBe(true)
    expect(droppedFromPrefix('ABC')).toBe(false)
    expect(droppedFromPrefix('é')).toBe(false)
  })
})

describe('the study-level code', () => {
  it('is suggested from a Latin label', () => {
    expect(slugifyLevel("Master's (Post-grad)")).toBe('master_s_post_grad')
    expect(slugifyLevel('Diplôme')).toBe('diplome')
  })

  it('is empty for a label in another script, and a typed code is cleaned', () => {
    expect(slugifyLevel('स्नातकोत्तर')).toBe('')
    expect(cleanLevelCode('PG Diploma!')).toBe('pg_diploma')
  })
})

describe('download file names', () => {
  it('keep the letters of every script', () => {
    expect(fileNameStem('नीला सागर क्विज़', 'quiz')).toBe('नीला सागर क्विज़')
    expect(fileNameStem('தமிழ் வினாடி வினா', 'quiz')).toBe('தமிழ் வினாடி வினா')
  })

  it('drops slashes, quotes, colons and emoji, and falls back when nothing is left', () => {
    expect(fileNameStem('Open day: "Kochi"/2026 🎉', 'event')).toBe('Open day Kochi2026')
    expect(fileNameStem('🎉🎉', 'event')).toBe('event')
    expect(fileNameStem(null, 'event')).toBe('event')
  })
})

describe('initials and truncation', () => {
  it('take the whole first letter, vowel sign and all', () => {
    expect('कि'.charAt(0)).not.toBe('कि')
    expect(firstChar('किरण')).toBe('कि')
    expect(firstChar('தமிழ்')).toBe('த')
    expect(firstChar('  ananya')).toBe('A')
  })

  it('cut by what a reader sees, never in the middle of a letter group or an emoji', () => {
    const text = 'क्षत्रिय'.repeat(20)
    const cut = clipGraphemes(text, 10)
    expect(graphemeLength(cut.replace('…', ''))).toBe(10)
    expect(cut.endsWith('…')).toBe(true)
    expect(clipGraphemes('👨‍👩‍👧👨‍👩‍👧👨‍👩‍👧', 2)).toBe('👨‍👩‍👧👨‍👩‍👧…')
  })
})

describe('form labels in Indian languages', () => {
  it('keep their letters when normalised', () => {
    expect(normaliseLabel('  पहला नाम * ')).toBe('पहला नाम')
    expect(normaliseLabel('First Name (पहला नाम)')).toBe('first name पहला नाम')
    expect(normaliseLabel('Email:')).toBe('email')
  })

  it('are recognised by the questions the profile can answer', () => {
    const has = (words: string[], label: string) => words.some((w) => normaliseLabel(label).includes(w))
    expect(has(FIRST_NAME_WORDS, 'पहला नाम')).toBe(true)
    expect(has(EMAIL_WORDS, 'ईमेल पता')).toBe(true)
    expect(has(EMAIL_WORDS, 'மின்னஞ்சல் முகவரி')).toBe(true)
    expect(has(PHONE_WORDS, 'మొబైల్ నంబర్')).toBe(true)
    expect(has(DOB_WORDS, 'জন্ম তারিখ')).toBe(true)
    expect(NAME_ONLY_WORDS.includes(normaliseLabel('நாம்'))).toBe(false)
    expect(NAME_ONLY_WORDS.includes(normaliseLabel('பெயர்'))).toBe(true)
  })

  it('do not take the place of birth for the date of birth', () => {
    expect(DOB_WORDS.some((w) => normaliseLabel('जन्म स्थान').includes(w))).toBe(false)
  })
})
