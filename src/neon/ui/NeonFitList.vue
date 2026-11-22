<script setup lang="ts">
import { onBeforeUnmount, onMounted, onUpdated, useTemplateRef } from 'vue'

import { fitCount } from './fit-list'

// A list that shows as many rows as its box has room for, never a half one
// and never scrolling (DESIGN.md, «Inicio en escritorio»): the home's widgets
// are boxes of a fixed number of cells, so a list adapts to the room it is
// given. The rows are the `<li>` of the slot. The list takes the space left
// in its card (`flex-1`); in a box with no fixed height, as when the widgets
// stack, everything fits. Hidden rows are `hidden`, so they leave the tab
// order and the reading order too.
const list = useTemplateRef<HTMLElement>('list')

function fit(): void {
  const element = list.value
  if (!element) return
  const rows = Array.from(element.children) as HTMLElement[]
  // Measure with every row in place, then hide the ones that overflow. All in
  // one task, so the browser never paints the in-between.
  for (const row of rows) row.hidden = false
  const count = fitCount(
    rows.map((row) => row.offsetTop + row.offsetHeight),
    element.clientHeight,
  )
  rows.forEach((row, index) => (row.hidden = index >= count))
}

let observer: ResizeObserver | undefined
onMounted(() => {
  fit()
  if (typeof ResizeObserver !== 'undefined' && list.value) {
    observer = new ResizeObserver(fit)
    observer.observe(list.value)
  }
  // The web fonts change the height of the rows when they arrive.
  void document.fonts?.ready.then(fit)
})
onUpdated(fit)
onBeforeUnmount(() => observer?.disconnect())
</script>

<template>
  <ul ref="list" class="relative min-h-0 flex-1 overflow-hidden">
    <slot />
  </ul>
</template>
