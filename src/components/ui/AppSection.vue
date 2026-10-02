<script setup lang="ts">
import { useTemplateRef } from 'vue'

const props = defineProps<{
  id: string
  isActive: boolean
}>()

const sectionEl = useTemplateRef<HTMLElement>('sectionEl')

defineExpose({
  get el() { return sectionEl.value },
})
</script>

<template>
  <section
    :id="props.id"
    ref="sectionEl"
    class="grid content-start gap-4"
    :class="props.isActive ? 'animate-panel-in' : 'hidden'"
    :aria-labelledby="`${props.id}-title`"
  >
    <slot />
  </section>
</template>
