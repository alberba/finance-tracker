<script setup lang="ts">
import { computed, nextTick, useTemplateRef, watch } from 'vue'

import type { ReportDetail } from '../../../domain/reports/report-entry'
import type { ReportThreadStatus } from '../../../composables/useReportThread'
import { isDemoMode } from '../../../scripts/demo-mode'
import type { ReportCommentInput, ReportCommentUpdateInput } from '../../../services/reports-api'
import NeonButton from '../../ui/NeonButton.vue'
import NeonReportComposer from './NeonReportComposer.vue'
import NeonReportDot from './NeonReportDot.vue'
import NeonReportMarkdown from './NeonReportMarkdown.vue'
import NeonReportThread from './NeonReportThread.vue'
import { detailStatus, sentLine } from './view-model'

// The detail of one report (artboard «Mis reportes · 2560 px»): its title, its
// status, the thread and the reply form. Loading, a failed load, a report that
// is not on the account and one that is gone from GitHub each have their own
// block (artboard «· estados en escritorio»).
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

const shown = computed(() =>
  (props.status === 'ready' || props.status === 'unavailable') && props.detail
    ? props.detail
    : null,
)
const view = computed(() =>
  shown.value ? detailStatus(shown.value.report, shown.value.threadIssue) : null,
)
const title = computed(() => {
  const report = shown.value?.report
  return report && !report.unavailable ? report.title : `Reporte #${props.issueNumber}`
})
const available = computed(() => shown.value !== null && !shown.value.report.unavailable)
/** A closed thread takes no replies; the demo shows the form, disabled. */
const readOnly = computed(() => shown.value !== null && !shown.value.canComment && !demo)

watch(
  () => props.status,
  async (status) => {
    if (status !== 'ready') return
    await nextTick()
    heading.value?.focus()
  },
  // The detail can mount after its report loaded (the list was empty or still
  // loading when a link opened it): the heading takes the focus then too.
  { immediate: true },
)

const CARD =
  'bg-panel border-line rounded-card flex min-w-0 flex-col border px-6 py-[22px] @max-lg:px-3 @max-lg:py-4'
</script>

<template>
  <div class="flex min-w-0 flex-col gap-5" data-report-detail>
    <div class="@3xl:hidden">
      <NeonButton data-report-back @click="$emit('back')">← Mis reportes</NeonButton>
    </div>

    <section
      v-if="status === 'loading' || status === 'idle'"
      :class="CARD"
      class="gap-3.5"
      aria-busy="true"
    >
      <p class="text-muted text-[14px]" role="status">Cargando el reporte…</p>
      <span aria-hidden="true" class="bg-panel2 block h-[22px] w-3/5 rounded-full"></span>
      <span aria-hidden="true" class="bg-panel2 block h-3 w-1/3 rounded-full"></span>
      <span aria-hidden="true" class="bg-panel2 block h-30 rounded-[18px]"></span>
    </section>

    <section v-else-if="status === 'error'" :class="CARD" class="items-start gap-3.5" role="alert">
      <p class="text-muted text-label tracking-label font-extrabold uppercase">
        Reporte #{{ issueNumber }}
      </p>
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
        {{ error }}
      </p>
      <NeonButton variant="primary" @click="$emit('retry')">Reintentar</NeonButton>
    </section>

    <section v-else-if="status === 'notFound'" :class="CARD" class="items-start gap-3.5">
      <p class="text-muted text-label tracking-label font-extrabold uppercase">
        Reporte #{{ issueNumber }}
      </p>
      <p class="text-[16px] font-bold">No encontramos este reporte en tu cuenta.</p>
      <NeonButton variant="primary" @click="$emit('back')">Volver a Mis reportes</NeonButton>
    </section>

    <template v-else-if="shown && view">
      <header class="flex min-w-0 flex-col gap-1.5">
        <p class="text-muted text-label tracking-label font-extrabold uppercase">
          Reporte #{{ issueNumber }}
        </p>
        <h2
          ref="heading"
          tabindex="-1"
          class="font-display max-w-[34ch] text-[24px] leading-[1.15] font-bold tracking-[-0.03em] text-pretty outline-none"
        >
          {{ title }}
        </h2>
        <p class="text-muted text-[14px]">{{ sentLine(shown.report) }}</p>
      </header>

      <section
        :class="CARD"
        class="motion-safe:animate-rise gap-3.5 [animation-delay:70ms]"
        aria-labelledby="reports-state-title"
      >
        <div class="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
          <h3 id="reports-state-title" class="text-block-title font-extrabold">Estado</h3>
          <a
            v-if="view.link"
            :href="view.link.href"
            target="_blank"
            rel="noopener noreferrer"
            class="outline-accent -my-2 inline-flex min-h-11 items-center gap-1.5 rounded-full ps-4 text-[14px] font-extrabold underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2 motion-safe:transition-transform motion-safe:duration-160 motion-safe:ease-out motion-safe:active:scale-[0.97]"
          >
            {{ view.link.label }}
            <svg
              class="size-4 shrink-0"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
              aria-hidden="true"
            >
              <path
                d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"
              />
            </svg>
            <span class="sr-only">(se abre en GitHub)</span>
          </a>
        </div>

        <p
          v-if="view.dot"
          class="flex items-center gap-2.5 text-[18px] font-extrabold"
          :data-report-status="issueNumber"
        >
          <NeonReportDot :tone="view.dot" size="md" />
          {{ view.headline }}
        </p>

        <div v-if="view.follow" class="bg-panel2 flex flex-col gap-1.5 rounded-[18px] px-4 py-3.5">
          <p
            class="font-display flex flex-wrap items-center gap-x-3 gap-y-1 text-[20px] font-semibold tracking-[-0.02em]"
          >
            <span class="text-muted line-through decoration-2"
              ><span class="sr-only">Original </span>{{ view.follow.from }}</span
            >
            <svg
              class="text-muted size-[22px] shrink-0"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
              aria-hidden="true"
            >
              <path d="M4 12h16M14 6l6 6-6 6" />
            </svg>
            <span><span class="sr-only">principal </span>{{ view.follow.to }}</span>
          </p>
          <p class="text-[15px] font-bold">{{ view.follow.title }}</p>
          <p class="text-muted text-[13px]">
            {{ view.follow.secondary }}. El estado y el hilo son los de la principal.
          </p>
        </div>

        <p
          v-if="view.warning"
          class="bg-panel2 flex items-start gap-2.5 rounded-[18px] px-4 py-3.5 text-[15px] font-bold"
          role="note"
        >
          <svg
            class="text-accent-text mt-px size-5 shrink-0"
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
          {{ view.warning }}
        </p>
      </section>

      <template v-if="available">
        <section
          v-if="shown.original"
          :class="CARD"
          class="motion-safe:animate-rise gap-3.5 [animation-delay:105ms]"
          aria-labelledby="reports-original-title"
        >
          <h3 id="reports-original-title" class="text-block-title font-extrabold">
            Tu descripción
          </h3>
          <NeonReportMarkdown :source="shown.original" />
        </section>

        <section
          v-if="shown.issueDescription"
          :class="CARD"
          class="motion-safe:animate-rise gap-3.5 [animation-delay:105ms]"
          aria-labelledby="reports-issue-description-title"
        >
          <div class="flex flex-col gap-1">
            <h3 id="reports-issue-description-title" class="text-block-title font-extrabold">
              Descripción en GitHub
            </h3>
            <p class="text-muted text-[14px]">Es el texto actual de la issue en GitHub.</p>
          </div>
          <NeonReportMarkdown :source="shown.issueDescription" />
        </section>

        <NeonReportThread
          :report="shown.report"
          :items="shown.thread"
          :can-comment="shown.canComment"
          :read-only="readOnly"
          :pending="pending"
          :error="error"
          :editing-id="editingCommentId"
          @update:editing-id="$emit('update:editingCommentId', $event)"
          @update="(commentId, input) => $emit('updateComment', commentId, input)"
          @delete="(commentId) => $emit('removeComment', commentId)"
        />

        <NeonReportComposer
          v-if="shown.canComment || demo"
          :report="shown.report"
          :pending="pending"
          :error="error"
          :reset-signal="composerResetSignal"
          @submit="$emit('addComment', $event)"
        />
      </template>
    </template>
  </div>
</template>
