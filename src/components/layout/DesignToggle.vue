<script setup lang="ts">
import { switchDesign } from '../../lib/client/design'
import { DESIGN_OPTIONS, type Design } from '../../lib/design'

// «Diseño nuevo / antiguo» toggle of the old frame: in the desktop sidebar (on
// the ink surface) and in the mobile "Más" sheet. A seam of ADR 0010: the new
// frame has its own copy in src/neon/layout/DesignToggle.vue.
defineProps<{ design: Design; variant: 'sidebar' | 'sheet' }>()

const STYLES = {
  sidebar: {
    track: 'bg-ink-text/6 sidebar-collapsed:flex-col',
    button: 'min-h-10 pointer-coarse:min-h-11 text-[0.8125rem]',
    active: 'bg-ink-text/14 text-ink-text',
    idle: 'text-ink-muted hover:bg-ink-text/6 hover:text-ink-text',
  },
  sheet: {
    track: 'bg-subtle',
    button: 'min-h-11 text-[0.9375rem]',
    active: 'bg-panel text-text-main shadow-card',
    idle: 'text-text-muted hover:text-text-main',
  },
} as const
</script>

<template>
  <div
    class="flex gap-0.5 rounded-md p-0.75"
    :class="STYLES[variant].track"
    role="group"
    aria-label="Diseño"
    data-design-toggle
  >
    <button
      v-for="option in DESIGN_OPTIONS"
      :key="option.value"
      type="button"
      class="focus-visible:outline-primary min-w-0 flex-1 rounded-sm px-2 font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2"
      :class="[
        STYLES[variant].button,
        design === option.value ? STYLES[variant].active : STYLES[variant].idle,
      ]"
      :aria-label="option.name"
      :aria-pressed="design === option.value"
      :data-design-option="option.value"
      @click="switchDesign(option.value)"
    >
      {{ option.label }}
    </button>
  </div>
</template>
