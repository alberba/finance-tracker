<script setup lang="ts">
import { computed } from 'vue'

// A money figure with its cents set small and muted («466,» «65» « €»), as the
// headline figures of the artboard. Size, weight and color come from the parent.
const props = defineProps<{ text: string }>()

const parts = computed(() => {
  const comma = props.text.lastIndexOf(',')
  if (comma < 0) return { whole: props.text, cents: '', rest: '' }
  return {
    whole: props.text.slice(0, comma + 1),
    cents: props.text.slice(comma + 1, comma + 3),
    rest: props.text.slice(comma + 3),
  }
})
</script>

<template>
  <span
    >{{ parts.whole
    }}<span class="text-muted text-[0.42em] tracking-[-0.02em]">{{ parts.cents }}</span
    >{{ parts.rest }}</span
  >
</template>
