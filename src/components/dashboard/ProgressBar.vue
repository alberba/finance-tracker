<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{
  /** Porcentaje (0-100) que determina el ancho de la barra. */
  value: number
}>()

const ariaNow = computed(() => Math.round(props.value))
const fillWidth = computed(() => `${props.value.toFixed(2)}%`)
</script>

<template>
  <div
    class="progress-track h-1.75 w-full overflow-hidden rounded-full bg-(--track-bg)"
    role="progressbar"
    aria-valuemin="0"
    aria-valuemax="100"
    :aria-valuenow="ariaNow"
  >
    <div
      class="progress-fill h-full rounded-[inherit] bg-[linear-gradient(90deg,color-mix(in_srgb,var(--primary)_80%,var(--income)),var(--primary))] transition-[width] duration-400 ease-out"
      :style="{ width: fillWidth }"
    ></div>
  </div>
</template>
