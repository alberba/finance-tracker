<script setup lang="ts">
import { useAccountRequirement } from '../../composables/useAccountRequirement'
import { useEntrySheet } from '../../composables/useEntrySheet'

// «Apuntar» button of the mobile frame (DESIGN.md, FAB): a round «+» beside the
// floating bottom bar that opens the entry sheet, on every screen. A screen that
// docks its own bar at the bottom (`data-bottom-dock`: «Aplicar», «Guardar»)
// takes the place: it hides.
const { needsAccount } = useAccountRequirement()
const { openEntrySheet } = useEntrySheet()
</script>

<template>
  <button
    type="button"
    class="bg-accent text-on-accent outline-text frame:hidden fixed inset-e-3 inset-be-[calc(16px+env(safe-area-inset-bottom,0px))] z-40 grid size-16 place-items-center rounded-full shadow-[0_10px_24px_oklch(0%_0_none/0.35)] focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-50 in-[:has([data-bottom-dock])]:hidden motion-safe:transition-transform motion-safe:duration-140 motion-safe:ease-out motion-safe:enabled:active:scale-[0.94]"
    aria-label="Apuntar"
    :disabled="needsAccount"
    data-fab-apuntar
    @click="openEntrySheet"
  >
    <svg
      class="size-7"
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
  </button>
</template>
