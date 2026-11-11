<script setup lang="ts">
import { computed } from 'vue'

import type { ReportEntry } from '../../../domain/reports/report-entry'
import NeonButton from '../../ui/NeonButton.vue'
import NeonReportDot from './NeonReportDot.vue'
import { countsLine, reportRow } from './view-model'

// The list of «Mis reportes» (artboard «Mis reportes · 2560 px»): one row per
// report, a real link so it opens in a new tab, with its status, the date it
// was sent and «Nuevo» while it has news the person has not read.
const props = defineProps<{
  reports: readonly ReportEntry[]
  selectedNumber: number | null
  /** Reports with news, counted by the server over all of them. */
  unseenCount: number
  hasMore: boolean
  loadingMore: boolean
  loadMoreError: string
}>()

const emit = defineEmits<{ select: [issueNumber: number]; loadMore: [] }>()

const rows = computed(() => props.reports.map(reportRow))
const counts = computed(() => countsLine(props.reports.length, props.unseenCount))

/** Lets Ctrl/Cmd/Shift/Alt and the middle button open the tab they mean to. */
function onSelect(event: MouseEvent, issueNumber: number): void {
  if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return
  event.preventDefault()
  emit('select', issueNumber)
}
</script>

<template>
  <section
    class="bg-panel border-line rounded-card motion-safe:animate-rise flex min-w-0 flex-col gap-2.5 overflow-clip border px-6 pt-[22px] pb-3 [animation-delay:70ms] @max-lg:px-3 @max-lg:pt-4"
    aria-labelledby="reports-list-title"
    data-report-list
  >
    <div class="flex items-baseline justify-between gap-3">
      <h2 id="reports-list-title" class="text-block-title font-extrabold">Tus reportes</h2>
      <p class="text-muted text-[13px]">
        <span class="font-display text-soft text-[13px] font-semibold">{{ counts.sent }}</span>
        enviados<template v-if="counts.news !== null">
          ·
          <span class="font-display text-accent-text text-[13px] font-semibold">{{
            counts.news
          }}</span>
          con novedades</template
        >
      </p>
    </div>

    <ul class="-mx-6 flex flex-col @max-lg:-mx-3">
      <li v-for="row in rows" :key="row.number" class="border-line border-t">
        <a
          :href="`/reportes?reporte=${row.number}`"
          class="outline-accent flex min-h-16 items-start gap-3.5 px-6 py-3.5 focus-visible:outline-2 focus-visible:-outline-offset-2 active:brightness-90 @max-lg:px-4"
          :class="
            row.number === selectedNumber
              ? 'bg-panel2 shadow-[inset_3px_0_0_var(--color-accent)]'
              : ''
          "
          :aria-current="row.number === selectedNumber ? 'true' : undefined"
          :data-report-entry="row.number"
          @click="onSelect($event, row.number)"
        >
          <span class="flex min-w-0 flex-1 flex-col gap-1.5">
            <span class="flex min-w-0 items-baseline gap-2.5">
              <span class="line-clamp-2 min-w-0 flex-1 text-[16px] leading-[1.3] font-bold">{{
                row.title ?? 'Reporte no disponible'
              }}</span>
              <span
                v-if="row.isNew"
                data-report-new
                class="text-label tracking-label text-accent-text inline-flex shrink-0 items-center gap-1.5 font-extrabold uppercase"
              >
                <span aria-hidden="true" class="bg-accent size-2 rounded-full"></span>
                Nuevo
              </span>
            </span>
            <span class="text-soft flex min-w-0 items-center gap-2 text-[14px] font-bold">
              <NeonReportDot :tone="row.dot" />
              <span class="min-w-0">{{ row.status }}</span>
            </span>
            <span class="text-muted text-[13px]">{{ row.meta }}</span>
          </span>
          <span
            class="font-display shrink-0 text-[15px] leading-[1.3] font-semibold"
            :class="row.title === null ? 'text-muted' : ''"
            >#{{ row.number }}</span
          >
        </a>
      </li>
    </ul>

    <div v-if="hasMore" class="grid justify-items-start gap-2 pb-2">
      <NeonButton :disabled="loadingMore" @click="emit('loadMore')">
        {{ loadingMore ? 'Cargando…' : 'Cargar más reportes' }}
      </NeonButton>
      <p v-if="loadMoreError" class="text-loss px-4 text-[14px] font-bold" role="alert">
        {{ loadMoreError }}
      </p>
    </div>
  </section>
</template>
