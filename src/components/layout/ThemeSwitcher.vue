<script setup lang="ts">
import SegmentedControl from '../ui/SegmentedControl.vue'
import { THEME_OPTIONS, useThemePreference } from '../../composables/useThemePreference'

// Theme picker of the shell: icon buttons in the sidebar (on the ink surface)
// and in the mobile bar, labelled options in the mobile "Más" sheet.
defineProps<{ variant: 'sidebar' | 'bar' | 'sheet' }>()

const { preference } = useThemePreference()

// Icon variants. The collapsed sidebar stacks the icons in a column.
const ICON_STYLES = {
  sidebar: {
    track: 'bg-ink-text/6 sidebar-collapsed:flex-col',
    button: 'h-10 pointer-coarse:h-11 sidebar-collapsed:h-9 sidebar-collapsed:pointer-coarse:h-11',
    active: 'bg-ink-text/14 text-ink-text',
    idle: 'text-ink-muted hover:bg-ink-text/6 hover:text-ink-text',
  },
  bar: {
    track: 'bg-subtle',
    button: 'h-11',
    active: 'bg-panel text-text-main shadow-card',
    idle: 'text-text-muted hover:text-text-main',
  },
} as const
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
    :class="ICON_STYLES[variant].track"
    role="group"
    aria-label="Tema"
  >
    <button
      v-for="option in THEME_OPTIONS"
      :key="option.value"
      type="button"
      class="focus-visible:outline-primary grid w-11 place-items-center rounded-sm transition-colors focus-visible:outline-2 focus-visible:outline-offset-2"
      :class="[
        ICON_STYLES[variant].button,
        preference === option.value ? ICON_STYLES[variant].active : ICON_STYLES[variant].idle,
      ]"
      :aria-label="option.name"
      :aria-pressed="preference === option.value"
      :title="option.name"
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
        <path :d="option.icon" />
      </svg>
    </button>
  </div>
</template>
