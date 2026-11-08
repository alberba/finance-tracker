<script setup lang="ts">
import { useAccountRequirement } from '../../composables/useAccountRequirement'
import { useEntrySheet } from '../../composables/useEntrySheet'

// «Apuntar» action of the desktop frame (DESIGN.md, Botón): opens the entry
// sheet as a side panel. The mobile frame has the FAB instead.
const { needsAccount } = useAccountRequirement()
const { openEntrySheet } = useEntrySheet()
</script>

<template>
  <button
    type="button"
    class="bg-accent text-on-accent font-display outline-text rounded-pill flex min-h-11 w-full items-center justify-center gap-2 px-[22px] text-[14px] font-bold focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-50 motion-safe:transition-transform motion-safe:duration-160 motion-safe:ease-out motion-safe:enabled:active:scale-[0.97]"
    :disabled="needsAccount"
    data-sidebar-apuntar
    @click="openEntrySheet"
  >
    <svg
      class="size-5"
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
