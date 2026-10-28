<script setup lang="ts">
import { onMounted, ref, useTemplateRef, watch } from 'vue'

import { useReportsRoute } from '../../composables/useReportsRoute'
import { useReportThread } from '../../composables/useReportThread'
import type {
  ReportCommentInput,
  ReportCommentUpdateInput,
} from '../../services/reports-api'
import { requestReportDialogOpen } from '../../scripts/report-dialog'
import { useReportsStore } from '../../stores/reports'
import AppSection from '../ui/AppSection.vue'
import BaseButton from '../ui/BaseButton.vue'
import PageHeader from '../ui/PageHeader.vue'
import ReportDetail from './ReportDetail.vue'
import ReportList from './ReportList.vue'

// «Mis reportes» (#340): lista e hilo en una sola pantalla de trabajo. No es
// una sección de `APP_SECTIONS`: el shell monta esta página en `/reportes`.
const reportsStore = useReportsStore()
const { selectedNumber, select, backToList, focusEntry } = useReportsRoute()
const { detail, status, error, pending, load, addComment, updateComment, removeComment } =
  useReportThread(selectedNumber)
const editingCommentId = ref<number | null>(null)
const composerResetSignal = ref(0)

watch(selectedNumber, () => {
  editingCommentId.value = null
})

async function onAddComment(input: ReportCommentInput): Promise<void> {
  if (await addComment(input)) composerResetSignal.value += 1
}

async function onUpdateComment(
  commentId: number,
  input: ReportCommentUpdateInput,
): Promise<void> {
  if (await updateComment(commentId, input)) editingCommentId.value = null
}

async function onRemoveComment(commentId: number): Promise<void> {
  await removeComment(commentId)
}
const list = useTemplateRef<HTMLElement>('list')

onMounted(() => void reportsStore.refresh({ force: true }))

function openCreate(): void {
  requestReportDialogOpen()
}

async function back(): Promise<void> {
  const previous = selectedNumber.value
  backToList()
  await nextTick()
  if (previous === null) return
  document.querySelector<HTMLElement>(`[data-report-entry="${previous}"]`)?.focus()
}
</script>

<template>
  <AppSection id="reports" :is-active="true">
    <div class="@container grid min-w-0 gap-5">
      <PageHeader
        kicker="Tu cuenta"
        title="Mis reportes"
        title-id="reports-title"
        lede="Sigue el estado de lo que has enviado y aclara lo que haga falta."
      >
        <template #aside>
          <BaseButton variant="primary" @click="openCreate">Crear reporte</BaseButton>
        </template>
      </PageHeader>

      <div
        v-if="reportsStore.status === 'loading'"
        class="mx-auto grid w-full max-w-6xl gap-3"
        aria-busy="true"
        aria-live="polite"
      >
        <p class="text-text-muted text-sm">Cargando tus reportes…</p>
        <div class="bg-subtle h-16 rounded-md"></div>
        <div class="bg-subtle h-16 rounded-md"></div>
        <div class="bg-subtle h-16 rounded-md"></div>
      </div>

      <div
        v-else-if="reportsStore.status === 'error'"
        class="grid justify-items-start gap-3"
        role="alert"
      >
        <p class="text-text-main">{{ reportsStore.error }}</p>
        <BaseButton variant="secondary" @click="reportsStore.refresh({ force: true })"
          >Reintentar</BaseButton
        >
      </div>

      <div
        v-else-if="reportsStore.reports.length === 0"
        class="border-line bg-panel mx-auto grid w-full max-w-6xl justify-items-start gap-4 rounded-lg border p-6"
      >
        <p class="text-text-main">Aún no has enviado ningún reporte.</p>
        <BaseButton variant="primary" @click="openCreate">Crear reporte</BaseButton>
      </div>

      <div v-else class="mx-auto flex w-full max-w-6xl flex-wrap items-start gap-x-10 gap-y-6">
        <section
          ref="list"
          class="sticky min-w-0 grow basis-88 self-start inset-bs-6"
          :class="selectedNumber !== null ? 'hidden @3xl:block' : ''"
          aria-label="Lista de reportes"
        >
          <ReportList
            :reports="reportsStore.reports"
            :selected-number="selectedNumber"
            @select="select"
          />
          <p v-if="reportsStore.hasMore" class="text-text-muted mbs-3 text-sm">
            Mostrando tus 100 reportes más recientes.
          </p>
        </section>

        <div
          v-if="selectedNumber !== null"
          class="min-w-[50%] grow-[999] basis-0 @max-3xl:min-w-full"
        >
          <ReportDetail
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
            @remove-comment="onRemoveComment"
            @update:editing-comment-id="editingCommentId = $event"
            @back="back"
          />
        </div>
        <div v-else class="hidden grow-[999] basis-0 @3xl:block">
          <p class="text-text-muted border-line rounded-lg border border-dashed p-6 text-sm">
            Selecciona un reporte para ver su estado y su hilo.
          </p>
        </div>
      </div>
    </div>
  </AppSection>
</template>
