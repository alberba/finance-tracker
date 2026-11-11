<script setup lang="ts">
import { computed, onMounted } from 'vue'

import { useReportDialogTrigger } from '../../composables/useReportDialogTrigger'
import { useReportsStore } from '../../stores/reports'

// «Reportar» button of the desktop frame (artboard «Mis reportes · 2560 px»):
// a 48px round button at the bottom right that unfolds to its word on hover or
// focus. A dot on it says that a report has news the person has not read. On
// the mobile frame the «Más» sheet opens the report panel instead. The panel
// itself comes in the default slot, so this file never imports the old design.
const isOpen = defineModel<boolean>('open', { default: false })
const reportsStore = useReportsStore()
const hasUpdates = computed(() => reportsStore.unseenCount > 0)

useReportDialogTrigger(() => {
  isOpen.value = true
})

// The store starts here, once per app: no polling, no intervals.
onMounted(() => {
  void reportsStore.refresh()
})
</script>

<template>
  <button
    v-show="!isOpen"
    id="global-report-trigger"
    type="button"
    class="group bg-panel text-accent-text shadow-float outline-accent frame:inline-flex border-accent/40 fixed inset-e-[22px] inset-be-[22px] z-45 hidden size-12 cursor-pointer items-center justify-center overflow-hidden rounded-full border text-[14px] font-extrabold hover:w-33 hover:-translate-y-0.5 hover:gap-[9px] hover:px-[15px] focus-visible:w-33 focus-visible:-translate-y-0.5 focus-visible:gap-[9px] focus-visible:px-[15px] focus-visible:outline-2 focus-visible:outline-offset-2 motion-safe:transition-[width,gap,padding,translate,transform] motion-safe:duration-200 motion-safe:ease-out motion-safe:active:scale-[0.97]"
    aria-label="Crear reporte"
    :aria-describedby="hasUpdates ? 'reports-updates-description' : undefined"
    @click="isOpen = true"
  >
    <svg
      class="size-5 shrink-0"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
    >
      <path
        d="M5 5.75A2.75 2.75 0 0 1 7.75 3h8.5A2.75 2.75 0 0 1 19 5.75v7.5A2.75 2.75 0 0 1 16.25 16H11l-4.25 3v-3.14A2.75 2.75 0 0 1 5 13.25zM8.5 8.5h7M8.5 11.5h4"
      />
    </svg>
    <span
      class="w-0 overflow-clip whitespace-nowrap opacity-0 group-hover:w-15.5 group-hover:opacity-100 group-focus-visible:w-15.5 group-focus-visible:opacity-100 motion-safe:transition-[width,opacity] motion-safe:duration-200 motion-safe:ease-out"
      >Reportar</span
    >
    <span
      v-if="hasUpdates"
      data-reports-updates
      class="bg-accent ring-panel absolute inset-e-0 inset-bs-0 size-2.5 rounded-full ring-2"
      aria-hidden="true"
    ></span>
  </button>
  <span v-if="hasUpdates" id="reports-updates-description" class="sr-only"
    >Hay novedades en tus reportes</span
  >

  <slot />
</template>
