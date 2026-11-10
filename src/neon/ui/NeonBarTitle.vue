<script setup lang="ts">
import { onMounted, shallowRef } from 'vue'

// The title of a section in the mobile top bar (DESIGN.md, «Barra superior
// móvil»): the bar is static markup of the frame, so this teleports the title
// into its slot, and while it is there the brand gives way. It is only a
// visual copy: the page keeps its own heading for screen readers and focus.
defineProps<{ title: string }>()

const slot = shallowRef<HTMLElement | null>(null)
onMounted(() => {
  slot.value = document.querySelector<HTMLElement>('[data-bar-title-slot]')
})
</script>

<template>
  <Teleport v-if="slot" :to="slot">
    <p
      class="font-display text-text truncate text-[30px] leading-[1.1] font-bold tracking-[-0.03em]"
      data-bar-title
      aria-hidden="true"
    >
      {{ title }}
    </p>
  </Teleport>
</template>
