<script setup lang="ts">
import { onBeforeUnmount, onMounted, onUpdated, useTemplateRef } from 'vue'

import { fitCount } from './fit-list'

// A list that shows as many rows as its box has room for, never a half one
// and never scrolling (DESIGN.md, «Inicio en escritorio»): the home's widgets
// are boxes of a fixed number of cells, so a list adapts to the room it is
// given. The rows are the `<li>` of the slot. The list takes the space left
// in its card (`flex-1`); in a box with no fixed height, as when the widgets
// stack, everything fits. Hidden rows are `hidden`, so they leave the tab
// order and the reading order too. On a bigger screen the box is bigger, so
// the list shows more rows: it fills the room, it does not stop at a count.
// `fitted` tells the card how many rows are in view, for a «see all» link when
// some are left out.
const list = useTemplateRef<HTMLElement>('list')
const emit = defineEmits<{ fitted: [count: number] }>()

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
  // A row that opens or folds (row-motion.ts) changes height over several
  // frames: the list refits as it goes, so a row pushed out hides in time.
  for (const row of rows) observer?.observe(row)
  emit('fitted', count)
}

let observer: ResizeObserver | undefined
// A row that has folded away leaves the list outside a render.
let mutations: MutationObserver | undefined
onMounted(() => {
  if (typeof ResizeObserver !== 'undefined' && list.value) {
    observer = new ResizeObserver(fit)
    observer.observe(list.value)
  }
  if (typeof MutationObserver !== 'undefined' && list.value) {
    mutations = new MutationObserver(fit)
    mutations.observe(list.value, { childList: true })
  }
  fit()
  // The web fonts change the height of the rows when they arrive.
  void document.fonts?.ready.then(fit)
})
onUpdated(fit)
onBeforeUnmount(() => {
  observer?.disconnect()
  mutations?.disconnect()
})
</script>

<template>
  <!-- The rows' hover highlight sticks out 12px on each side of the text (-mx-3): the
       list gives that room back as padding, so overflow-hidden clips only the rows
       that do not fit and never the rounded corners of the one under the pointer. -->
  <ul ref="list" class="relative -mx-3 min-h-0 flex-1 overflow-hidden px-3">
    <slot />
  </ul>
</template>
