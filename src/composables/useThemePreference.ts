import { computed, onBeforeUnmount, shallowRef } from 'vue'

import type { SegmentedOption } from '../components/ui/SegmentedControl.vue'
import { getThemeController, type ThemePreference } from '../lib/client/theme'

/** The three choices, in the order every theme control shows them. */
export const THEME_OPTIONS: SegmentedOption<ThemePreference>[] = [
  { value: 'light', label: 'Claro' },
  { value: 'system', label: 'Sistema' },
  { value: 'dark', label: 'Oscuro' },
]

/** The page's theme preference (writable) and the theme it resolves to. */
export function useThemePreference() {
  const controller = getThemeController()
  const state = shallowRef(controller.getState())
  const stop = controller.subscribe((next) => {
    state.value = next
  })
  onBeforeUnmount(stop)

  const preference = computed<ThemePreference>({
    get: () => state.value.preference,
    set: (value) => controller.setPreference(value),
  })
  const theme = computed(() => state.value.theme)

  return { preference, theme }
}
