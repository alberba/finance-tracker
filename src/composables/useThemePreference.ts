import { computed, onBeforeUnmount, shallowRef } from 'vue'

import type { SegmentedOption } from '../components/ui/SegmentedControl.vue'
import { getThemeController, type ThemePreference } from '../lib/client/theme'

/** A theme choice: its visible label, its name as an icon button and its icon path. */
export interface ThemeOption extends SegmentedOption<ThemePreference> {
  name: string
  icon: string
}

/** The three choices, in the order every theme control shows them. */
export const THEME_OPTIONS: ThemeOption[] = [
  {
    value: 'light',
    label: 'Claro',
    name: 'Tema claro',
    icon: 'M16 12a4 4 0 1 1-8 0 4 4 0 1 1 8 0zM12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4',
  },
  {
    value: 'system',
    label: 'Sistema',
    name: 'Tema del sistema',
    icon: 'M5 4h14a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2zM8 20h8M12 16v4',
  },
  {
    value: 'dark',
    label: 'Oscuro',
    name: 'Tema oscuro',
    icon: 'M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z',
  },
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
