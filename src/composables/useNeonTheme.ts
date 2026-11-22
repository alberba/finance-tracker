import { computed, onBeforeUnmount, shallowRef } from 'vue'

import { getNeonThemeController, type NeonTheme } from '../lib/client/neon-theme'

/** The new design's theme: the one painted now, writable (a write is the user's choice). */
export function useNeonTheme() {
  const controller = getNeonThemeController()
  const state = shallowRef(controller.getState())
  const stop = controller.subscribe((next) => {
    state.value = next
  })
  onBeforeUnmount(stop)

  const theme = computed<NeonTheme>({
    get: () => state.value.theme,
    set: (value) => controller.setPreference(value),
  })

  return { theme }
}
