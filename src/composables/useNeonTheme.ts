import { computed, onBeforeUnmount, shallowRef, watch } from 'vue'

import { syncSettingsUpdate } from '../lib/client/command-mapping'
import { getNeonThemeController, NEON_THEMES, type NeonTheme } from '../lib/client/neon-theme'
import { useFinancialStateStore } from '../stores/financial-state'

function isNeonTheme(value: unknown): value is NeonTheme {
  return NEON_THEMES.some((theme) => theme === value)
}

/**
 * The theme: the one painted now, writable. A write is the user's choice: it
 * is painted at once and saved to the user, so their other devices follow.
 */
export function useNeonTheme() {
  const controller = getNeonThemeController()
  const financial = useFinancialStateStore()
  const state = shallowRef(controller.getState())
  const stop = controller.subscribe((next) => {
    state.value = next
  })
  onBeforeUnmount(stop)

  const theme = computed<NeonTheme>({
    get: () => state.value.theme,
    set: (value) => {
      controller.setPreference(value)
      if (financial.state.theme === value) return
      financial.commitState((draft) => {
        draft.theme = value
      })
      void syncSettingsUpdate({ theme: value })
    },
  })

  return { theme }
}

/**
 * Paints the user's theme once their settings arrive, and again when another
 * device changes it. The device's stored choice only paints the first frame.
 */
export function useUserTheme(): void {
  const controller = getNeonThemeController()
  const financial = useFinancialStateStore()
  watch(
    () => financial.state.theme,
    (theme) => {
      if (isNeonTheme(theme) && controller.getState().preference !== theme) {
        controller.setPreference(theme)
      }
    },
    { immediate: true },
  )
}
