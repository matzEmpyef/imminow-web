import { cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'
// jest-dom matchers (toBeInTheDocument, toBeDisabled, …) registered on Vitest's expect. Imported
// for its side effect; the module also augments the matcher types for tsc.
import '@testing-library/jest-dom/vitest'

// Testing Library only auto-unmounts between tests when the runner exposes globals; this config
// keeps globals off (explicit imports read better), so the unmount is wired here instead. Without
// it, a denial card rendered by one test is still in the document when the next one asserts it
// is absent.
afterEach(cleanup)
