<script setup lang="ts">
import { onMounted, ref, watch } from 'vue'

import { useReportsRoute } from '../../../composables/useReportsRoute'
import { useReportThread } from '../../../composables/useReportThread'
import { requestReportDialogOpen } from '../../../scripts/report-dialog'
import type { ReportCommentInput, ReportCommentUpdateInput } from '../../../services/reports-api'
import { useReportsStore } from '../../../stores/reports'
import NeonButton from '../../ui/NeonButton.vue'
import NeonReportDetail from './NeonReportDetail.vue'
import NeonReportList from './NeonReportList.vue'

// «Mis reportes» in the new design (artboards «Mis reportes · 2560 px» and
// «· estados en escritorio», #448): the list and the open report's thread side
// by side. It is not a section of the menu: the shell mounts it at `/reportes`
// and no entry is marked as current.
withDefaults(defineProps<{ isActive?: boolean }>(), { isActive: true })

const reportsStore = useReportsStore()
const { selectedNumber, select, backToList, focusEntry } = useReportsRoute()
const { detail, status, error, pending, load, addComment, updateComment, removeComment } =
  useReportThread(selectedNumber)
const editingCommentId = ref<number | null>(null)
const composerResetSignal = ref(0)

watch(selectedNumber, (number) => {
  editingCommentId.value = null
  // A report created from the panel while this page is open is not in the list
  // yet: opening it (the «Ver en Mis reportes» link) reads the list again.
  if (number !== null && !reportsStore.reports.some((report) => report.number === number)) {
    void reportsStore.refresh()
  }
})

async function onAddComment(input: ReportCommentInput): Promise<void> {
  if (await addComment(input)) composerResetSignal.value += 1
}

async function onUpdateComment(commentId: number, input: ReportCommentUpdateInput): Promise<void> {
  if (await updateComment(commentId, input)) editingCommentId.value = null
}

onMounted(() => void reportsStore.refresh({ force: true }))

async function back(): Promise<void> {
  const previous = selectedNumber.value
  backToList()
  if (previous === null) return
  await focusEntry(previous)
}
</script>

<template>
  <section
    id="reports"
    class="@container mx-auto grid w-full max-w-[1640px] min-w-0 content-start gap-5"
    aria-labelledby="reports-title"
  >
    <div class="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
      <header class="flex min-w-0 flex-1 basis-105 flex-col gap-2">
        <p
          class="text-muted text-label tracking-label motion-safe:animate-rise font-extrabold uppercase"
        >
          Tu cuenta
        </p>
        <h1
          id="reports-title"
          class="font-display motion-safe:animate-rise text-[clamp(30px,3.2cqi,44px)] leading-[1.1] font-bold tracking-[-0.03em]"
        >
          Mis reportes
        </h1>
        <p class="text-soft motion-safe:animate-rise max-w-155 text-[16px] [animation-delay:70ms]">
          Sigue el estado de lo que has enviado y aclara lo que haga falta.
        </p>
      </header>
      <NeonButton
        v-if="reportsStore.status !== 'ready' || reportsStore.reports.length > 0"
        @click="requestReportDialogOpen()"
      >
        <svg
          class="size-[18px] shrink-0"
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
        Crear reporte
      </NeonButton>
    </div>

    <section
      v-if="reportsStore.status === 'loading' || reportsStore.status === 'idle'"
      class="bg-panel border-line rounded-card flex w-full max-w-180 min-w-0 flex-col gap-3.5 border px-6 py-[22px] @max-lg:px-3 @max-lg:py-4"
      aria-busy="true"
      aria-labelledby="reports-loading"
    >
      <p id="reports-loading" class="text-muted text-[14px]" role="status">
        Cargando tus reportes…
      </p>
      <ul class="flex flex-col" aria-hidden="true">
        <li
          v-for="width in ['72%', '54%', '64%', '46%']"
          :key="width"
          class="border-line flex min-h-22 items-center gap-3 border-t py-3"
        >
          <span class="flex min-w-0 flex-1 flex-col gap-2">
            <span
              class="bg-panel2 motion-safe:animate-fade-in block h-3.5 rounded-full"
              :style="{ width }"
            ></span>
            <span class="bg-panel2 block h-2.5 w-[38%] rounded-full"></span>
          </span>
          <span class="bg-panel2 block h-3.5 w-11 shrink-0 rounded-full"></span>
        </li>
      </ul>
    </section>

    <section
      v-else-if="reportsStore.status === 'error'"
      class="bg-panel border-line rounded-card flex w-full max-w-180 min-w-0 flex-col items-start gap-3.5 border px-6 py-[22px] @max-lg:px-3 @max-lg:py-4"
      role="alert"
    >
      <p class="flex items-start gap-2.5 text-[16px] font-bold">
        <svg
          class="text-loss mt-px size-5 shrink-0"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
          aria-hidden="true"
        >
          <path d="M12 3l9.5 17h-19zM12 10v4M12 17h.01" />
        </svg>
        {{ reportsStore.error }}
      </p>
      <p class="text-muted text-[14px]">
        Tus reportes siguen guardados; solo falta leer su estado.
      </p>
      <NeonButton variant="primary" @click="reportsStore.refresh({ force: true })"
        >Reintentar</NeonButton
      >
    </section>

    <section
      v-else-if="reportsStore.reports.length === 0"
      class="border-line rounded-card flex w-full max-w-180 min-w-0 flex-col items-start gap-3.5 border border-dashed px-6 py-[22px]"
      aria-labelledby="reports-empty-title"
      data-empty-state
    >
      <h2 id="reports-empty-title" class="text-block-title font-extrabold">
        Aún no has enviado ningún reporte.
      </h2>
      <p class="text-muted text-[14px]">Lo que envíes aparecerá aquí con su estado y su hilo.</p>
      <NeonButton variant="primary" @click="requestReportDialogOpen()">Crear reporte</NeonButton>
    </section>

    <div v-else class="flex min-w-0 flex-wrap items-start gap-5">
      <div
        class="min-w-0 grow basis-105 self-start @3xl:sticky @3xl:top-6"
        :class="selectedNumber !== null ? '@max-3xl:hidden' : ''"
      >
        <NeonReportList
          :reports="reportsStore.reports"
          :selected-number="selectedNumber"
          :unseen-count="reportsStore.unseenCount"
          :has-more="reportsStore.hasMore"
          :loading-more="reportsStore.loadingMore"
          :load-more-error="reportsStore.loadMoreError"
          @select="select"
          @load-more="reportsStore.loadMore()"
        />
      </div>

      <div v-if="selectedNumber !== null" class="min-w-1/2 grow-999 basis-0 @max-3xl:min-w-full">
        <NeonReportDetail
          :issue-number="selectedNumber"
          :detail="detail"
          :status="status"
          :error="error"
          :pending="pending"
          :editing-comment-id="editingCommentId"
          :composer-reset-signal="composerResetSignal"
          @retry="load"
          @add-comment="onAddComment"
          @update-comment="onUpdateComment"
          @remove-comment="removeComment"
          @update:editing-comment-id="editingCommentId = $event"
          @back="back"
        />
      </div>
      <div
        v-else
        class="border-line rounded-card min-w-1/2 grow-999 basis-0 border border-dashed px-6 py-[22px] @max-3xl:hidden"
      >
        <p class="text-muted text-[14px]">Selecciona un reporte para ver su estado y su hilo.</p>
      </div>
    </div>
  </section>
</template>
