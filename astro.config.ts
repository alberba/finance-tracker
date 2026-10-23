import { createRequire } from 'node:module'
import { dirname, resolve } from 'node:path'
import { defineConfig } from 'astro/config'
import cloudflare from '@astrojs/cloudflare'
import node from '@astrojs/node'

import tailwindcss from '@tailwindcss/vite'

import vue from '@astrojs/vue'

import svgLoader from 'vite-svg-loader'

import sentry from '@sentry/astro'

const require = createRequire(import.meta.url)
const selfHosted = process.env.DEPLOY_TARGET === 'node'
const sqlitePath = resolve(process.env.SQLITE_PATH ?? '.data/finance.sqlite')
const oauthNetworkAliases =
  process.env.AUTH_E2E_NETWORK === 'true'
    ? [
        {
          find: /^@better-fetch\/fetch$/,
          replacement: resolve('tests/e2e/authentication/oauth-fetch.mjs'),
        },
        {
          find: 'authentication-external-fetch',
          replacement: require
            .resolve('@better-fetch/fetch', { paths: [dirname(require.resolve('better-auth'))] })
            .replace('index.cjs', 'index.js'),
        },
      ]
    : []

export default defineConfig({
  output: 'server',

  devToolbar: {
    enabled: false,
  },

  adapter: selfHosted
    ? node({ mode: 'standalone' })
    : cloudflare({
        configPath: process.env.CLOUDFLARE_CONFIG_PATH,
        persistState: process.env.CLOUDFLARE_PERSIST_PATH
          ? { path: process.env.CLOUDFLARE_PERSIST_PATH }
          : true,
      }),

  server: {
    host: true,
    port: 4321,
  },

  vite: {
    // Discovering these during hydration replaces Vue's shared chunks mid-page.
    optimizeDeps: {
      include: [
        '@better-auth/passkey/client',
        '@sentry/astro',
        '@sentry/browser',
        'better-auth/client',
        'better-auth/client/plugins',
        'chart.js',
        'pinia',
        'zod',
      ],
    },
    server: {
      // Runtime and test artifacts change while the dev server is serving
      // requests: SQLite WAL files, the local D1 state and Playwright's reports
      // and traces. Watching them made Vite reload the app mid-request, which
      // surfaced as intermittent "fetch failed" errors.
      watch: {
        ignored: [
          `${sqlitePath}`,
          `${sqlitePath}-wal`,
          `${sqlitePath}-shm`,
          `${sqlitePath}-journal`,
          '**/.wrangler/**',
          '**/.scratch/**',
          '**/.data/**',
          '**/coverage/**',
          '**/blob-report/**',
          '**/blob-report-*/**',
          '**/playwright-report/**',
          '**/playwright-report-*/**',
        ],
      },
    },
    resolve: {
      alias: [
        ...oauthNetworkAliases,
        ...(selfHosted
          ? [
              {
                find: 'cloudflare:workers',
                replacement: resolve('src/lib/server/local/runtime.ts'),
              },
              { find: '@sentry/cloudflare', replacement: '@sentry/node' },
            ]
          : []),
      ],
    },
    envPrefix: ['PUBLIC_', 'AUTH_TEST_PORT'],
    plugins: [tailwindcss(), svgLoader()],
  },

  integrations: [
    vue({
      appEntrypoint: '/src/vue-app',
    }),
    sentry({
      project: 'finance-tracker',
      org: 'alberba',
      authToken: process.env.SENTRY_AUTH_TOKEN,
      sourcemaps: { disable: !process.env.SENTRY_AUTH_TOKEN },
      release: { create: Boolean(process.env.SENTRY_AUTH_TOKEN) },
      telemetry: false,
      // Server-side Sentry lives in the Worker entry (`wrangler.toml` -> `main`,
      // see `sentry.server.config.ts`): this integration's automatic Worker wrap
      // does not apply with `@astrojs/cloudflare` v14
      // (getsentry/sentry-javascript#21901).
      enabled: { client: true, server: false },
      autoInstrumentation: { requestHandler: false },
    }),
  ],
})
