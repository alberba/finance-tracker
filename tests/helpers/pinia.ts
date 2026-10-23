import { createPinia } from 'pinia'
import { createApp } from 'vue'

/** Give store setup the same application context it has in the app. */
export function createTestPinia() {
  const pinia = createPinia()
  createApp({}).use(pinia)
  return pinia
}
