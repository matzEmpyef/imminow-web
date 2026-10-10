#!/usr/bin/env node
// Date-format guard (owner's ruling 2026-10-10: every date the console shows is DD-MM-YYYY, one
// format across the platform). `formatDate` / `formatDateTime` in src/lib/time.ts are the ONE place
// that decides how a date reads; a screen that calls `toLocaleDateString()` gets whatever the
// browser's locale produces (16/08/2026 here, 8/16/2026 there), which is how the console ended up
// with slashes.
//
// POLICY:
//   - `toLocaleDateString(` and `toLocaleTimeString(` are banned outside src/lib/time.ts.
//   - `Intl.DateTimeFormat(` is banned outside src/lib/time.ts and src/lib/eventTimezones.ts (which
//     only use it to work out time zones), unless the line, or the line above it, carries
//     `date-guard-ok` and says why (a chart axis or a month heading is a label, not a date).
//   - Tests are not scanned.
//
// Same mechanics and the same deliberate limits as check-spacing.mjs: plain text, no AST.

import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

const SRC_DIR = new URL('../src/', import.meta.url)
const HOME_FILES = new Set(['src/lib/time.ts'])
const ZONE_FILES = new Set(['src/lib/eventTimezones.ts'])

function findFiles(dirUrl, relDir = 'src') {
  const results = []
  for (const entry of readdirSync(dirUrl, { withFileTypes: true })) {
    const entryUrl = new URL(`${entry.name}${entry.isDirectory() ? '/' : ''}`, dirUrl)
    const relPath = join(relDir, entry.name)
    if (entry.isDirectory()) {
      results.push(...findFiles(entryUrl, relPath))
    } else if (/\.(ts|tsx)$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name) && entry.name !== 'schema.d.ts') {
      results.push(relPath.replaceAll('\\', '/'))
    }
  }
  return results
}

const files = findFiles(SRC_DIR)
const failures = []

for (const relPath of files) {
  if (HOME_FILES.has(relPath)) continue
  const lines = readFileSync(new URL(`../${relPath}`, import.meta.url), 'utf8').split(/\r?\n/)
  lines.forEach((text, i) => {
    const code = text.replace(/\/\/.*$/, '')
    if (/\.toLocale(Date|Time)String\(/.test(code)) {
      failures.push(`${relPath}:${i + 1} — use formatDate / formatDateTime / formatTime from '@/lib/time'`)
    } else if (/Intl\.DateTimeFormat\(/.test(code) && !ZONE_FILES.has(relPath)) {
      const marked = text.includes('date-guard-ok') || (lines[i - 1] ?? '').includes('date-guard-ok')
      if (!marked) {
        failures.push(
          `${relPath}:${i + 1} — use formatDate / formatDateTime from '@/lib/time', or mark a chart/heading label with "date-guard-ok"`,
        )
      }
    }
  })
}

// Streams, not console.* — same no-console/--max-warnings=0 reasoning as check-max-w.mjs.
if (failures.length > 0) {
  process.stderr.write('date-format guard failed:\n\n')
  for (const failure of failures) process.stderr.write(`  ${failure}\n`)
  process.stderr.write(
    '\nEvery date the console shows is DD-MM-YYYY (DD-MM-YYYY, HH:mm with a time), decided in one\n' +
      'place: src/lib/time.ts. Do not format a date with the browser locale.\n',
  )
  process.exit(1)
}

process.stdout.write(`date-format guard: checked ${files.length} files, no stray date formatting found.\n`)
