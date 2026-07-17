import { defineConfig } from 'astro/config'
import cloudflare from '@astrojs/cloudflare'

import tailwindcss from '@tailwindcss/vite'

import vue from '@astrojs/vue'

import svgLoader from 'vite-svg-loader'

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
  ],
})
