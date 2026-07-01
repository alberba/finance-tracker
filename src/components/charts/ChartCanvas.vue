<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'

// `draw` is expected to be a computed-returned closure that captures the
// current chart data, so a new function identity signals "data changed".
const props = defineProps<{
  draw: (canvas: HTMLCanvasElement) => void
}>()

const canvasRef = ref<HTMLCanvasElement | null>(null)
let themeObserver: MutationObserver | null = null

function render(): void {
  const canvas = canvasRef.value
  if (canvas) {
    props.draw(canvas)
  }
}

watch(() => props.draw, render, { flush: 'post' })

onMounted(() => {
  render()
  // Canvas charts read CSS variables at draw time, so repaint on theme change.
  themeObserver = new MutationObserver(() => render())
  themeObserver.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['data-theme'],
  })
})

onBeforeUnmount(() => {
  themeObserver?.disconnect()
  themeObserver = null
})
</script>

<template>
  <canvas ref="canvasRef" v-bind="$attrs" />
</template>
