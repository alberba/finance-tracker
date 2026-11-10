<script setup lang="ts">
import { shallowRef, watch } from 'vue'

import { useAccountRequirement } from '../../composables/useAccountRequirement'
import { useEntrySheet } from '../../composables/useEntrySheet'
import { useWindowScroll } from '../../composables/useWindowScroll'

// «Apuntar» button of the mobile frame (DESIGN.md, FAB): opens the entry sheet.
// It folds to its icon while the page goes down and unfolds when it goes up
// or comes back near the top. A screen that docks its own bar at the bottom
// (`data-bottom-dock`: «Aplicar», «Guardar») takes the place: the button hides.
const { needsAccount } = useAccountRequirement()
const { openEntrySheet } = useEntrySheet()

/** Scroll (px) that counts as a direction, and the top band where it always unfolds. */
const STEP = 6
const TOP_BAND = 24

const folded = shallowRef(false)
const scrollY = useWindowScroll()
let lastY = scrollY.value

watch(scrollY, (y) => {
  const delta = y - lastY
  if (y < TOP_BAND) folded.value = false
  else if (delta > STEP) folded.value = true
  else if (delta < -STEP) folded.value = false
  else return
  lastY = y
})
</script>

<template>
  <button
    type="button"
    class="group bg-accent text-on-accent font-display outline-text frame:hidden fixed inset-e-4 inset-be-[calc(118px+env(safe-area-inset-bottom,0px))] z-40 flex h-14 w-34 items-center gap-2.5 overflow-clip rounded-[16px] ps-4 text-[15px] font-bold whitespace-nowrap [filter:drop-shadow(0_10px_18px_oklch(0%_0_none/0.45))] focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-50 in-[:has([data-bottom-dock])]:hidden data-[folded=true]:w-14 motion-safe:transition-[width,scale] motion-safe:duration-260 motion-safe:ease-out motion-safe:enabled:active:scale-[0.97]"
    :disabled="needsAccount"
    :data-folded="folded"
    data-fab-apuntar
    @click="openEntrySheet"
  >
    <svg
      class="size-6 shrink-0"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2.25"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
    >
      <path d="M12 5v14M5 12h14" />
    </svg>
    <span
      class="group-data-[folded=true]:opacity-0 motion-safe:transition-opacity motion-safe:duration-200 motion-safe:ease-out"
    >
      Apuntar
    </span>
  </button>
</template>
