import path from 'node:path'
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

// Vitest slice (readiness audit, 2026-09-03 — "zero frontend tests" was the largest single gap).
// Deliberately its own config rather than a `test` block in vite.config.ts: that file's exported
// function throws on a missing VITE_API_BASE_URL during hosted builds, and tests must never be
// hostage to deployment env. Same `@` alias, same React plugin, jsdom for component tests.
//
// Scope is a SLICE, not coverage: the pieces every page depends on (money formatting, the feature
// registry, the two gates, the shared Table, cursor paging, ApiError). Page-level journeys stay
// with the browser walkthroughs until Playwright lands against a real backend.
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
    css: false,
    restoreMocks: true,
  },
})
