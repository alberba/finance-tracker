<script setup lang="ts">
import { computed, onMounted } from 'vue'

import { useReportDialogTrigger } from '../../composables/useReportDialogTrigger'
import { useReportsStore } from '../../stores/reports'
import IssueReportPanel from './IssueReportPanel.vue'

// The floating «Reportar» button (desktop; on mobile the «Más» sheet opens the
// panel) and the report side panel it opens.
const isOpen = defineModel<boolean>('open', { default: false })
const reportsStore = useReportsStore()
const hasUpdates = computed(() => reportsStore.unseenCount > 0)

useReportDialogTrigger(() => {
  isOpen.value = true
})

// El store arranca aquí, una sola vez por app: sin sondeos ni intervalos.
onMounted(() => {
  void reportsStore.refresh()
})
</script>

<template>
  <button
    v-show="!isOpen"
    id="global-report-trigger"
    class="group border-primary/40 bg-elevated text-primary shadow-pop focus-visible:outline-primary desk:inline-flex fixed right-5.5 bottom-5.5 z-45 hidden h-12 w-12 cursor-pointer items-center justify-center overflow-hidden rounded-full border transition-[width,gap,padding,translate,box-shadow] duration-200 hover:w-33 hover:-translate-y-0.5 hover:gap-2.25 hover:px-3.75 focus-visible:w-33 focus-visible:-translate-y-0.5 focus-visible:gap-2.25 focus-visible:px-3.75 focus-visible:outline-2 focus-visible:outline-offset-2"
    type="button"
    aria-label="Crear reporte"
    :aria-describedby="hasUpdates ? 'reports-updates-description' : undefined"
    @click="isOpen = true"
  >
    <svg
      class="size-5 flex-none"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="1.8"
      aria-hidden="true"
    >
      <path
        d="M5 5.75A2.75 2.75 0 0 1 7.75 3h8.5A2.75 2.75 0 0 1 19 5.75v7.5A2.75 2.75 0 0 1 16.25 16H11l-4.25 3v-3.14A2.75 2.75 0 0 1 5 13.25z"
      />
      <path d="M8.5 8.5h7M8.5 11.5h4" />
    </svg>
    <span
      class="w-0 overflow-hidden text-sm font-bold whitespace-nowrap opacity-0 transition-[width,opacity] duration-200 group-hover:w-15.5 group-hover:opacity-100 group-focus-visible:w-15.5 group-focus-visible:opacity-100"
      >Reportar</span
    >
    <span
      v-if="hasUpdates"
      data-reports-updates
      class="bg-accent ring-elevated absolute end-0 inset-bs-0 size-2.5 rounded-full ring-2"
      aria-hidden="true"
    ></span>
  </button>
  <span v-if="hasUpdates" id="reports-updates-description" class="sr-only"
    >Hay novedades en tus reportes</span
  >

  <IssueReportPanel v-model:open="isOpen" />
</template>
