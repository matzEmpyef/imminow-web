#!/usr/bin/env node
// M10 guard (frontend review, 1 Sep 2026 — "known, bitten twice"). This project's spacing scale
// (`spacing.xs/sm/md/lg/xl` in tailwind.config.ts) shares its key names with Tailwind's own named
// `max-w-*` scale, and under this project's Tailwind v4 `@config` compat path, `max-w-md` etc.
// silently resolve from the WRONG scale (`max-w-md` → 16px, not 28rem) rather than erroring — see
// tailwind.config.ts's own note. AppErrorBoundary and GlobalSearch were both bitten by this before
// switching to inline `style={{ maxWidth }}`; every other real max-width need in this codebase
// already uses `max-w-[Nrem]` (an arbitrary value, which bypasses the broken named scale) instead.
//
// oxlint has no rule that understands this project's Tailwind config, so this is a plain grep: any
// element carrying two `max-w-*` utilities AT THE SAME VARIANT (no responsive/state prefix, or the
// identical prefix chain) is either the landmine above being reintroduced, or a genuine copy-paste
// leftover — Tailwind's cascade order (not utility order) decides which one wins, silently. Two
// max-w-* utilities under DIFFERENT prefixes (e.g. `max-w-full md:max-w-[42rem]`) are legitimate
// responsive stacking and are not flagged.
//
// Deliberately only greps plain string class attributes (`className="..."` / `className='...'`)
// — template-literal/expression classNames are rare in this codebase (checked 2026-09-01) and a
// full JSX/AST parse is overkill for what is fundamentally a copy-paste guard.

import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

const SRC_DIR = new URL('../src/', import.meta.url)

/** Every .tsx/.jsx file under src, relative to web/ — plain recursive walk, no glob dependency. */
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
const MAX_W_TOKEN = /^(.*:)?max-w-\S+$/

/** The prefix chain before `max-w-` (e.g. `md:hover:` from `md:hover:max-w-lg`), '' for none. */
function variantOf(token) {
  const match = MAX_W_TOKEN.exec(token)
  return match?.[1] ?? ''
}

let failures = []

for (const relPath of files) {
  const absPath = new URL(`../${relPath}`, import.meta.url)
  const content = readFileSync(absPath, 'utf8')
  let match
  while ((match = CLASS_ATTR.exec(content))) {
    const classString = match[2]
    const tokens = classString.split(/\s+/).filter(Boolean)
    const maxWTokens = tokens.filter((t) => MAX_W_TOKEN.test(t))
    if (maxWTokens.length < 2) continue

    const byVariant = new Map()
    for (const token of maxWTokens) {
      const variant = variantOf(token)
      if (!byVariant.has(variant)) byVariant.set(variant, [])
      byVariant.get(variant).push(token)
    }
    for (const [variant, tokensAtVariant] of byVariant) {
      if (tokensAtVariant.length < 2) continue
      const line = content.slice(0, match.index).split('\n').length
      failures.push(
        `${relPath}:${line} — conflicting max-w utilities at the "${variant || '(base)'}" variant: ${tokensAtVariant.join(', ')}`,
      )
    }
  }
}

// process.std{out,err}.write rather than console.* — this repo's oxlint config warns on
// `console` (`no-console`, `--max-warnings=0` in package.json's `lint` script) and there is no
// per-file exemption mechanism for a plain .mjs script, so writing straight to the streams keeps
// this script itself lint-clean instead of needing an inline disable.
if (failures.length > 0) {
  process.stderr.write('max-w collision guard failed (see FRONTEND_REVIEW.md M10):\n\n')
  for (const failure of failures) process.stderr.write(`  ${failure}\n`)
  process.stderr.write(
    '\nTwo max-w-* utilities at the same variant silently collide (last-defined-in-the-stylesheet wins, not\n' +
      'last-in-the-class-list) — pick one, or use an inline style={{ maxWidth }} the way GlobalSearch.tsx does.\n',
  )
  process.exit(1)
}

process.stdout.write(`max-w collision guard: checked ${files.length} files, no collisions found.\n`)
