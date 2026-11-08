<script setup lang="ts">
import { useAccountRequirement } from '../../composables/useAccountRequirement'
import { useEntrySheet } from '../../composables/useEntrySheet'

// «Apuntar» button of the mobile frame (DESIGN.md, FAB): opens the entry sheet.
const { needsAccount } = useAccountRequirement()
const { openEntrySheet } = useEntrySheet()
</script>

<template>
  <button
    type="button"
    class="bg-accent text-on-accent font-display outline-text frame:hidden fixed inset-e-4 inset-be-[calc(118px+env(safe-area-inset-bottom,0px))] z-40 flex h-14 items-center gap-2.5 rounded-[16px] ps-4 pe-[22px] text-[15px] font-bold [filter:drop-shadow(0_10px_18px_oklch(0%_0_none/0.45))] focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-50 motion-safe:transition-transform motion-safe:duration-160 motion-safe:ease-out motion-safe:enabled:active:scale-[0.97]"
    :disabled="needsAccount"
    data-fab-apuntar
    @click="openEntrySheet"
  >
    <svg
      class="size-6"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
    >
      <path d="M12 5v14M5 12h14" />
    </svg>
    Apuntar
  </button>
</template>
