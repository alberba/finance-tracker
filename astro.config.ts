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

  adapter: cloudflare({
    platformProxy: {
      enabled: true,
    },
  }),

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
      authToken: process.env.PLAYWRIGHT_TEST ? undefined : process.env.SENTRY_AUTH_TOKEN,
    }),
  ],
})
