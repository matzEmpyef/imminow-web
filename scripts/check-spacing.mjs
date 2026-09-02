#!/usr/bin/env node
// Spacing-token guard (consistency close-out, 2026-09-02). The design system's spacing scale
// (tokens.css: xs=4px sm=8px md=16px lg=24px xl=32px) sits ON Tailwind's 4px grid, so five of
// Tailwind's numeric spacing steps are pixel-identical to a token: 1→xs, 2→sm, 4→md, 6→lg, 8→xl.
// Writing `p-4` where `p-md` exists is how the audit's "off-token spacing utilities" count grew —
// each one reads as a design decision when it's actually just the token's alias, and the moment
// the token values change in tokens.css those aliases silently stop matching the system.
//
// POLICY (deliberately narrow so this can never force a visual change):
//   - A numeric step with an exact token twin (1/2/4/6/8) on a margin/padding/gap/space utility
//     is a failure — write the token instead. The two are pixel-identical today, so converting
//     is always safe; that identity is exactly why the numeric form is banned.
//   - A numeric step with NO token twin (3=12px, 5=20px, 0.5, 10, …) is ALLOWED — there is no
//     token to prefer, and inventing one is a design decision, not a lint's.
//   - Sizing (w-/h-/size-), positioning (top-/inset-/translate-), and border widths are out of
//     scope: the token scale is a spacing rhythm, not a size system.
//
// Same mechanics and the same deliberate limits as check-max-w.mjs: plain string className
// attributes only, no AST — this is a drift guard, not a compiler.

import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

const SRC_DIR = new URL('../src/', import.meta.url)

function findFiles(dirUrl, relDir = 'src') {
  const results = []
  for (const entry of readdirSync(dirUrl, { withFileTypes: true })) {
    const entryUrl = new URL(`${entry.name}${entry.isDirectory() ? '/' : ''}`, dirUrl)
    const relPath = join(relDir, entry.name)
    if (entry.isDirectory()) {
      results.push(...findFiles(entryUrl, relPath))
    } else if (/\.(tsx|jsx)$/.test(entry.name)) {
      results.push(relPath.replaceAll('\\', '/'))
    }
  }
  return results
}

const files = findFiles(SRC_DIR)

const CLASS_ATTR = /className\s*=\s*(["'])((?:(?!\1).)*)\1/g
// Optional variant chain, optional negative, the spacing families, then exactly a twin-holding
// numeric step. `gap-x`/`gap-y`/`space-x`/`space-y` are listed before their shorter prefixes are
// irrelevant here because the whole token must match end-to-end.
const OFF_TOKEN =
  /^(?:[\w[\]&:>~.-]+:)?-?(?:p|px|py|pt|pr|pb|pl|m|mx|my|mt|mr|mb|ml|gap|gap-x|gap-y|space-x|space-y)-(?:1|2|4|6|8)$/
const TOKEN_FOR = { 1: 'xs', 2: 'sm', 4: 'md', 6: 'lg', 8: 'xl' }

const failures = []

for (const relPath of files) {
  const absPath = new URL(`../${relPath}`, import.meta.url)
  const content = readFileSync(absPath, 'utf8')
  let match
  while ((match = CLASS_ATTR.exec(content))) {
    const tokens = match[2].split(/\s+/).filter(Boolean)
    for (const token of tokens) {
      if (!OFF_TOKEN.test(token)) continue
      const step = token.slice(token.lastIndexOf('-') + 1)
      const line = content.slice(0, match.index).split('\n').length
      failures.push(
        `${relPath}:${line} — "${token}" has a pixel-identical token: use "${token.slice(0, token.lastIndexOf('-') + 1)}${TOKEN_FOR[step]}"`,
      )
    }
  }
}

// Streams, not console.* — same no-console/--max-warnings=0 reasoning as check-max-w.mjs.
if (failures.length > 0) {
  process.stderr.write('spacing-token guard failed:\n\n')
  for (const failure of failures) process.stderr.write(`  ${failure}\n`)
  process.stderr.write(
    '\nThese numeric steps are exact aliases of the design tokens (1→xs 2→sm 4→md 6→lg 8→xl).\n' +
      'Write the token so the spacing system stays the single source of truth. Steps with no\n' +
      'token twin (3, 5, 10, …) are allowed — this guard only bans writing a token by its alias.\n',
  )
  process.exit(1)
}

process.stdout.write(`spacing-token guard: checked ${files.length} files, no off-token aliases found.\n`)
