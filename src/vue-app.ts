import type { App } from 'vue'

import { pinia } from './stores/pinia'

export default function setupVueApp(app: App): void {
  app.use(pinia)
}
