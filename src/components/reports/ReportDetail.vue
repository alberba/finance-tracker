<script setup lang="ts">
import { computed, nextTick, useTemplateRef, watch } from 'vue'

import type { ReportDetail } from '../../domain/reports/report-entry'
import { formatLongDate } from '../../lib/format'
import { isDemoMode } from '../../scripts/demo-mode'
import type { ReportThreadStatus } from '../../composables/useReportThread'
import type { ReportCommentInput, ReportCommentUpdateInput } from '../../services/reports-api'
import BaseButton from '../ui/BaseButton.vue'
import DocumentSurface from '../ui/DocumentSurface.vue'
import KickerLabel from '../ui/KickerLabel.vue'
import NumberedBlock from '../ui/NumberedBlock.vue'
import ReportComposer from './ReportComposer.vue'
import ReportMarkdown from './ReportMarkdown.vue'
import ReportStatus from './ReportStatus.vue'
import ReportThread from './ReportThread.vue'

const props = defineProps<{
  issueNumber: number
  detail: ReportDetail | null
  status: ReportThreadStatus
  error: string
  pending: boolean
  editingCommentId: number | null
  composerResetSignal: number
}>()

defineEmits<{
  back: []
  retry: []
  addComment: [input: ReportCommentInput]
  updateComment: [commentId: number, input: ReportCommentUpdateInput]
  removeComment: [commentId: number]
  'update:editingCommentId': [commentId: number | null]
}>()

const demo = isDemoMode()
const heading = useTemplateRef<HTMLElement>('heading')

// Los bloques opcionales desplazan la numeración de los siguientes.
const issueDescriptionShown = computed(() => Boolean(props.detail?.issueDescription))
const threadNumber = computed(() => (issueDescriptionShown.value ? '04' : '03'))
const composerNumber = computed(() => (issueDescriptionShown.value ? '05' : '04'))

watch(
  () => props.status,
  async (status) => {
    if (status !== 'ready') return
    await nextTick()
    heading.value?.focus()
  },
)
</script>

<template>
  <div class="min-w-0" data-report-detail>
    <BaseButton variant="ghost" class="mbs-2 @3xl:hidden" @click="$emit('back')"
      >← Mis reportes</BaseButton
    >

    <div v-if="props.status === 'loading'" class="grid gap-4" aria-busy="true" aria-live="polite">
      <p class="text-text-muted text-sm">Cargando el reporte…</p>
      <div class="bg-subtle h-6 w-2/3 rounded-md"></div>
      <div class="bg-subtle h-24 rounded-md"></div>
    </div>

    <div v-else-if="props.status === 'error'" class="grid justify-items-start gap-3" role="alert">
      <p class="text-text-main">{{ props.error }}</p>
      <BaseButton variant="secondary" @click="$emit('retry')">Reintentar</BaseButton>
    </div>

    <div v-else-if="props.status === 'notFound'" class="grid justify-items-start gap-3">
      <p class="text-text-main">No encontramos este reporte en tu cuenta.</p>
      <BaseButton variant="secondary" @click="$emit('back')">Volver a Mis reportes</BaseButton>
    </div>

    <div
      v-else-if="props.status === 'unavailable' && props.detail"
      class="grid justify-items-start gap-3"
    >
      <h3
        :id="`report-detail-${props.issueNumber}`"
        class="font-display text-text-main text-2xl font-bold"
      >
        Reporte #{{ props.issueNumber }}
      </h3>
      <p class="text-text-muted text-sm">
        Enviado el {{ formatLongDate(props.detail.report.submittedAt) }}
      </p>
      <p class="bg-notice text-notice-text rounded-md px-4 py-3 text-sm" role="note">
        Este reporte ya no está disponible en GitHub
      </p>
    </div>

    <template v-else-if="props.status === 'ready' && props.detail">
      <header class="grid gap-2">
        <KickerLabel tone="muted" class="tabular-nums">
          Reporte #{{ props.issueNumber }}
        </KickerLabel>
        <h3
          :id="`report-detail-${props.issueNumber}`"
          ref="heading"
          tabindex="-1"
          class="font-display text-text-main focus-visible:outline-primary text-2xl leading-tight font-bold tracking-tight focus-visible:outline-2"
        >
          {{ 'title' in props.detail.report ? props.detail.report.title : '' }}
        </h3>
        <p v-if="props.detail.threadIssue" class="text-text-muted text-sm">
          Hilo de
          <a
            :href="props.detail.threadIssue.url"
            target="_blank"
            rel="noopener noreferrer"
            class="text-primary font-semibold underline-offset-4 hover:underline"
            >#{{ props.detail.threadIssue.number }}</a
          >
          en GitHub.
        </p>
      </header>

      <DocumentSurface class="mbs-5">
        <NumberedBlock number="01" title="Estado" title-id="report-state-title">
          <ReportStatus :entry="props.detail.report" />
        </NumberedBlock>

        <NumberedBlock number="02" title="Tu descripción" title-id="report-original-title">
          <ReportMarkdown v-if="props.detail.original" :source="props.detail.original" />
          <p v-else class="bg-subtle text-text-muted rounded-md px-4 py-3 text-sm" role="note">
            Tu descripción original no se conserva en los reportes anteriores.
          </p>
        </NumberedBlock>

        <NumberedBlock
          v-if="props.detail.issueDescription"
          number="03"
          title="Descripción en GitHub"
          title-id="report-issue-description-title"
          description="Es el texto actual de la issue; la automatización puede haberlo reformulado."
        >
          <ReportMarkdown :source="props.detail.issueDescription" />
        </NumberedBlock>

        <NumberedBlock :number="threadNumber" title="Hilo" title-id="report-thread-title">
          <ReportThread
            :items="props.detail.thread"
            :can-comment="props.detail.canComment"
            :pending="props.pending"
            :error="props.error"
            :editing-id="props.editingCommentId"
            @update:editing-id="$emit('update:editingCommentId', $event)"
            @update="(commentId, input) => $emit('updateComment', commentId, input)"
            @delete="(commentId) => $emit('removeComment', commentId)"
          />
        </NumberedBlock>

        <NumberedBlock
          :number="composerNumber"
          title="Nueva aclaración"
          title-id="report-composer-title"
        >
          <ReportComposer
            v-if="props.detail.canComment || demo"
            :pending="props.pending"
            :error="props.error"
            :reset-signal="props.composerResetSignal"
            @submit="$emit('addComment', $event)"
          />
          <p v-else class="bg-subtle text-text-muted rounded-md px-4 py-3 text-sm" role="note">
            Este reporte está cerrado: el hilo es de solo lectura.
          </p>
        </NumberedBlock>
      </DocumentSurface>

      <p class="text-text-muted mbs-3 text-sm">
        Los comentarios de la automatización y las aclaraciones de otras personas no se muestran.
      </p>
    </template>
  </div>
</template>
