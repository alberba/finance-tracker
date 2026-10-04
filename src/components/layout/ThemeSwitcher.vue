<script setup lang="ts">
import SegmentedControl from '../ui/SegmentedControl.vue'
import { THEME_OPTIONS, useThemePreference } from '../../composables/useThemePreference'
import type { ThemePreference } from '../../lib/client/theme'

// Theme picker of the shell: icon buttons in the sidebar (on the ink surface)
// and in the mobile bar, labelled options in the mobile "Más" sheet.
const props = defineProps<{ variant: 'sidebar' | 'bar' | 'sheet' }>()

const { preference } = useThemePreference()

const ICONS: Record<ThemePreference, { name: string; path: string }> = {
  light: {
    name: 'Tema claro',
    path: 'M16 12a4 4 0 1 1-8 0 4 4 0 1 1 8 0zM12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4',
  },
  system: {
    name: 'Tema del sistema',
    path: 'M5 4h14a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2zM8 20h8M12 16v4',
  },
  dark: { name: 'Tema oscuro', path: 'M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z' },
}

const TONE = {
  sidebar: {
    track: 'bg-ink-text/6 sidebar-collapsed:flex-col sidebar-collapsed:[&>button]:h-9',
    active: 'bg-ink-text/14 text-ink-text',
    idle: 'text-ink-muted hover:bg-ink-text/6 hover:text-ink-text',
  },
  bar: {
    track: 'bg-subtle',
    active: 'bg-panel text-text-main shadow-card',
    idle: 'text-text-muted hover:text-text-main',
  },
} as const

const tone = props.variant === 'sheet' ? TONE.bar : TONE[props.variant]
</script>

<template>
  <SegmentedControl
    v-if="variant === 'sheet'"
    v-model="preference"
    :options="THEME_OPTIONS"
    label="Tema"
    variant="soft"
    data-key="theme-pref"
    class="[&>button]:h-11 [&>button]:flex-1"
  />
  <div
    v-else
    class="flex gap-0.5 rounded-md p-0.75"
    :class="tone.track"
    role="group"
    aria-label="Tema"
  >
    <button
      v-for="option in THEME_OPTIONS"
      :key="option.value"
      type="button"
      class="focus-visible:outline-primary grid h-10 w-11 place-items-center rounded-sm transition-colors focus-visible:outline-2 focus-visible:outline-offset-2"
      :class="preference === option.value ? tone.active : tone.idle"
      :aria-label="ICONS[option.value].name"
      :aria-pressed="preference === option.value"
      :title="option.label"
      :data-theme-pref="option.value"
      @click="preference = option.value"
    >
      <svg
        class="size-4.5"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="1.8"
        stroke-linecap="round"
        stroke-linejoin="round"
        aria-hidden="true"
      >
        <path :d="ICONS[option.value].path" />
      </svg>
    </button>
  </div>
</template>
