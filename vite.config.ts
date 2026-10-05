import fs from 'node:fs'
import path from 'node:path'
import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { checkConnectSrc, cspFromVercelConfig } from './src/lib/cspCoverage.ts'

// https://vite.dev/config/
export default defineConfig(({ command, mode }) => {
  const env = loadEnv(mode, __dirname, 'VITE_')

  // Fail the build rather than ship a broken bundle (added 2026-08-25).
  //
  // `api/client.ts` passes this straight to `createClient` as its `baseUrl`. When it is missing the
  // value is `undefined`, which openapi-fetch treats as "relative", so every request resolves
  // against the page's own origin — the deployed console quietly calls itself and returns 404s that
  // look like a backend fault. That is exactly what happened on the first staging deploy, where the
  // variable was scoped to Vercel's Preview environment while the deployment was Production.
  //
  // Scoped to hosted builds, not every local one. `npm run build` runs in *production* mode, which
  // never loads `.env.development` — so a developer compile-checking the build would otherwise be
  // blocked for a variable that only matters once the bundle is actually served. (Worth noting that
  // those local builds have always produced a bundle with no API URL; harmless, because nobody
  // serves them.)
  //
  // `CI` is set by Vercel and by GitHub Actions alike, so this keeps working if the console later
  // moves to S3 behind a CloudFront distribution built in CI.
  const isHostedBuild = command === 'build' && (process.env.CI || process.env.VERCEL)
  if (isHostedBuild && !env.VITE_API_BASE_URL) {
    throw new Error(
      'VITE_API_BASE_URL is not set.\n\n' +
        'The built console would call its own origin instead of the API, so this build is being\n' +
        'stopped rather than deployed. Set it in the hosting environment (on Vercel: Settings →\n' +
        'Environment Variables, ticked for the environment being built — Production and Preview are\n' +
        'scoped separately), then redeploy without the build cache.\n',
    )
  }
  if (command === 'build' && !isHostedBuild && !env.VITE_API_BASE_URL) {
    // eslint-disable-next-line no-console -- build-time diagnostic in the Vite config, not app code; there is no other channel to reach the developer running the build
    console.warn(
      '\n[build] VITE_API_BASE_URL is not set — this bundle would call its own origin.\n' +
        '        Fine for a local compile check; a hosted build would be refused.\n',
    )
  }

  // Fail the build rather than ship a console its own security policy blocks (review F-031).
  //
  // `vercel.json`'s `connect-src` is a hand-written list. An API origin that is not on it (or is
  // there only as https, which does not cover the live connection's wss form) or a storage origin
  // that is not on it gives a deployed console whose requests the browser refuses, with nothing in
  // the build to say so. Hosted builds only, for the same reason as the check above. The storage
  // origin is checked when `VITE_UPLOAD_ORIGIN` is set; until then it can only be warned about —
  // see src/lib/cspCoverage.ts for what DevOps has to supply.
  if (isHostedBuild) {
    const policy = cspFromVercelConfig(JSON.parse(fs.readFileSync(path.resolve(__dirname, 'vercel.json'), 'utf8')))
    if (policy) {
      const { errors, warnings } = checkConnectSrc({
        policy,
        apiBaseUrl: env.VITE_API_BASE_URL,
        uploadOrigin: env.VITE_UPLOAD_ORIGIN,
      })
      // eslint-disable-next-line no-console -- build-time diagnostic in the Vite config, as above
      for (const warning of warnings) console.warn(`\n[build] Content-Security-Policy: ${warning}\n`)
      if (errors.length > 0) {
        throw new Error(
          'The Content-Security-Policy in vercel.json would block this build\'s own requests.\n\n' +
            errors.map((e) => `  - ${e}`).join('\n') +
            '\n\nAdd the missing origin(s) to connect-src in vercel.json (or correct the environment\n' +
            'variable), then redeploy.\n',
        )
      }
    }
  }

  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
      },
    },
    server: {
      port: 5174,
      strictPort: true,
    },
  }
})
