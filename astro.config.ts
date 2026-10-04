import { defineConfig } from 'astro/config'
import cloudflare from '@astrojs/cloudflare'

import tailwindcss from '@tailwindcss/vite'

import vue from '@astrojs/vue'

import svgLoader from 'vite-svg-loader'

import sentry from '@sentry/astro'

export default defineConfig({
  output: 'server',

  devToolbar: {
    enabled: false,
  },

  adapter: cloudflare(),

  server: {
    host: true,
    port: 4321,
  },

  vite: {
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
