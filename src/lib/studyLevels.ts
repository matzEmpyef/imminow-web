import { useMemo } from 'react'
import { humaniseCode } from '@/lib/humanise'
import { useStudyLevels } from '@/queries/studyLevels'
import type { components } from '@/api/schema'

export type StudyLevel = components['schemas']['StudyLevel']

/**
 * ONE education ladder, served (assumptions audit M23, product owner 2026-09-19).
 *
 * This file used to hold two hand-written maps, and two more lived elsewhere —
 * `STUDY_LEVEL_LABELS` here, `EDUCATION_LEVEL_LABELS` inside StudentProfileFields,
 * `ENTRY_QUALIFICATIONS` inside courseFormShared, `COURSE_LEVEL_LABELS` here again. Four copies of
 * one ladder in two vocabularies, and one of them had no `phd` at all, so a PhD row rendered as
 * the raw code `phd` and a PhD course could not state a Master's entry requirement.
 *
 * All four now come off `GET /study-levels`, which since 2026-09-19 carries `rank` (the rung's
 * level of education, what search compares), `entry_qualification_code` (the SAME rung spelled the
 * way a student's education rows and a course's `requirements.academic.entry_qualification` spell
 * it — `tenth` where the table says `10th`) and `entry_qualification` (whether a course may
 * require this rung at all). Adding a rung is now a server edit, not a console release.
 *
 * Reads its list the way `lib/genders.ts` does — one module every surface shares, so two screens
 * cannot disagree about what "masters" is called. The difference is that this list is fetched
 * rather than compiled in, so the module exposes a hook instead of a constant.
 *
 * NOTE ON THE ENDPOINT: the audit names `GET /courses/levels` as the source. That endpoint serves
 * a bare `string[]` of the level codes present in the caller's catalogue (it is the Course Finder's
 * "which levels do we actually have" chooser) and carries none of `rank` / `label` /
 * `entry_qualification_code` / `entry_qualification`. The table with those columns is
 * `GET /study-levels`, which is what this reads.
 */
export interface LevelLadder {
  /** Every rung, retired ones included, so a historical row still resolves to a word. */
  all: StudyLevel[]
  /** The rungs a picker may offer — active only, in `sort_order`. */
  options: StudyLevel[]
  /**
   * A rung's label from EITHER spelling of its code (`12th` or `twelfth`), case-insensitively.
   * A code the table does not carry reads as itself, tidied, never as a neighbouring rung's label
   * (the M34 rule in `humaniseCode`).
   */
  label: (code: string | null | undefined) => string
  /** The rung's level of education — what `GET /courses?filter[level]` compares. Null if unknown. */
  rank: (code: string | null | undefined) => number | null
  /**
   * The Minimum-qualification dropdown on the course form: the rungs a course is allowed to
   * require, in ladder order, keyed by the EDUCATION vocabulary the course requirement stores.
   */
  entryQualifications: { value: string; label: string }[]
  /** True while the table is still in flight — a picker shows a skeleton rather than an empty list. */
  isLoading: boolean
}

function matches(level: StudyLevel, code: string) {
  return level.code.toLowerCase() === code || (level.entry_qualification_code ?? '').toLowerCase() === code
}

export function useLevelLadder(): LevelLadder {
  // `include_inactive` on purpose: a retired rung must still render as a word wherever a student
  // or a course already carries it. `options` below is what a picker offers.
  const query = useStudyLevels(true)
  const all = useMemo(() => query.data ?? [], [query.data])

  return useMemo(() => {
    const find = (code: string | null | undefined) => {
      if (!code) return undefined
      const needle = String(code).trim().toLowerCase()
      if (!needle) return undefined
      return all.find((l) => matches(l, needle))
    }
    const options = all
      .filter((l) => l.active !== false)
      .slice()
      .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
    return {
      all,
      options,
      label: (code) => (code ? (find(code)?.label ?? humaniseCode(String(code))) : ''),
      rank: (code) => find(code)?.rank ?? null,
      entryQualifications: options
        .filter((l) => l.entry_qualification)
        .map((l) => ({ value: l.entry_qualification_code ?? l.code, label: l.label })),
      isLoading: query.isLoading,
    }
  }, [all, query.isLoading])
}

/**
 * The ladder for code that cannot call a hook — `profileFacts` builds its rows in a plain
 * function, so its caller passes the ladder in. Nothing here invents labels; a caller with no
 * ladder yet still renders the raw code tidied rather than a wrong neighbour.
 */
export const EMPTY_LADDER: LevelLadder = {
  all: [],
  options: [],
  label: (code) => (code ? humaniseCode(String(code)) : ''),
  rank: () => null,
  entryQualifications: [],
  isLoading: false,
}
