<script setup lang="ts">
import { switchDesign } from '../../lib/client/design'
import type { Design } from '../../lib/design'

// «Diseño nuevo / antiguo» toggle of the new frame, at the foot of the sidebar:
// a segmented control (DESIGN.md). A seam of ADR 0010: the old frame has its
// own copy in src/components/layout/DesignToggle.vue.
defineProps<{ design: Design }>()

const OPTIONS: Array<{ value: Design; label: string; name: string }> = [
  { value: 'neon', label: 'Nuevo', name: 'Diseño nuevo' },
  { value: 'legacy', label: 'Antiguo', name: 'Diseño antiguo' },
]
</script>

<template>
  <div
    class="bg-panel2 rounded-pill flex gap-0.75 p-0.75"
    role="group"
    aria-label="Diseño"
    data-design-toggle
  >
    <button
      v-for="option in OPTIONS"
      :key="option.value"
      type="button"
      class="rounded-pill text-soft pointer-fine:hover:text-text aria-pressed:bg-sel-bg aria-pressed:text-sel-text outline-accent min-h-9 min-w-0 flex-1 px-2 text-sm font-extrabold focus-visible:outline-2 focus-visible:outline-offset-2 motion-safe:transition-[transform,background-color,color] motion-safe:duration-140 motion-safe:ease-out motion-safe:active:scale-[0.97] pointer-coarse:min-h-11"
      :aria-label="option.name"
      :aria-pressed="design === option.value"
      :data-design-option="option.value"
      @click="switchDesign(option.value)"
    >
      {{ option.label }}
    </button>
  </div>
</template>
