import { useState } from 'react'
import { uploadProblem, type UploadKind } from '@/lib/uploadRules'

/**
 * The check a file picker makes before it sends anything (decision 154, ruling 9): `check(file)`
 * says whether the file is of an accepted type and size, and keeps the one shared sentence in
 * `problem` for the screen to show beside the picker. A file that passes clears an earlier sentence.
 */
export function useUploadCheck(kind: UploadKind) {
  const [problem, setProblem] = useState<string | null>(null)
  return {
    problem,
    check(file: Pick<File, 'type' | 'size'>): boolean {
      const found = uploadProblem(file, kind)
      setProblem(found)
      return found === null
    },
    clear: () => setProblem(null),
  }
}
