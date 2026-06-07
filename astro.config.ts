import { defineConfig } from 'astro/config'
import cloudflare from '@astrojs/cloudflare'

import tailwindcss from '@tailwindcss/vite'

import vue from '@astrojs/vue'

export default defineConfig({
  output: 'server',

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
    plugins: [tailwindcss()],
  },

  integrations: [vue()],
})
