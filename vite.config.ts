import path from 'node:path'
import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

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
