<script setup lang="ts">
import { useNeonTheme } from '../../../composables/useNeonTheme'
import { THEME_CHOICES } from './view-model'

// The four themes of DESIGN.md as a group of toggle buttons. Each swatch is
// painted by the theme it names (`data-theme` on the swatch redefines the
// tokens inside it), so it can't drift from the real values. The choice
// applies at once and is saved to the user, for all their devices.
const { theme } = useNeonTheme()
</script>

<template>
  <div
    class="grid grid-cols-2 gap-2 @lg:grid-cols-4"
    role="group"
    aria-label="Tema"
    data-theme-picker
  >
    <button
      v-for="choice in THEME_CHOICES"
      :key="choice.value"
      type="button"
      class="border-ctrl-line bg-panel text-soft rounded-field outline-accent aria-pressed:border-sel-border aria-pressed:bg-sel-bg aria-pressed:text-sel-text pointer-fine:hover:text-text flex min-h-12 min-w-0 items-center gap-2.5 border px-2.5 text-start text-[15px] font-extrabold focus-visible:outline-2 focus-visible:outline-offset-2 motion-safe:transition-[transform,background-color,color] motion-safe:duration-140 motion-safe:ease-out motion-safe:active:scale-[0.98]"
      :aria-pressed="theme === choice.value"
      :data-theme-option="choice.value"
      @click="theme = choice.value"
    >
      <span
        :data-theme="choice.value"
        class="bg-bg border-ctrl-line grid size-8 shrink-0 place-items-center rounded-full border"
        aria-hidden="true"
      >
        <span class="bg-accent size-3 rounded-full"></span>
      </span>
      <span class="min-w-0">{{ choice.label }}</span>
    </button>
  </div>
</template>
