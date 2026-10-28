<script setup lang="ts">
import { computed } from 'vue'

import type { ReportEntry } from '../../domain/reports/report-entry'
import { formatShortDate } from '../../lib/format'
import PillTag from '../ui/PillTag.vue'
import ReportStatus from './ReportStatus.vue'

// Fila de la lista: un enlace real (abre en pestaña nueva y se lee bien), con
// el número como asiento contable y la línea de seguimiento cuando aplica.
const props = defineProps<{ report: ReportEntry; selected: boolean }>()
const emit = defineEmits<{ select: [issueNumber: number] }>()

const href = computed(() => `/reportes?reporte=${props.report.number}`)

/** Deja que Ctrl/Cmd/Shift/Alt y el botón central abran la pestaña que toca. */
function onSelect(event: MouseEvent): void {
  if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return
  event.preventDefault()
  emit('select', props.report.number)
}
const followed = computed(() => (props.report.unavailable ? undefined : props.report.followed))
</script>

<template>
  <li class="border-line border-b last:border-b-0">
    <a
      :href="href"
      class="focus-visible:outline-primary group active:bg-subtle flex min-h-14 min-w-0 items-start gap-3 border-s-2 px-3 py-3 transition-colors focus-visible:outline-2 focus-visible:outline-offset-[-2px]"
      :class="props.selected ? 'border-primary bg-subtle' : 'hover:bg-subtle border-transparent'"
      :aria-current="props.selected ? 'true' : undefined"
      :data-report-entry="props.report.number"
      @click="onSelect"
    >
      <span
        class="text-text-muted mbs-0.5 font-mono text-xs font-semibold tabular-nums"
        aria-hidden="true"
        >#{{ props.report.number }}</span
      >
      <span class="grid min-w-0 flex-1 gap-1.5">
        <span class="flex min-w-0 items-start gap-2">
          <span
            v-if="props.report.unavailable"
            class="text-text-main min-w-0 flex-1 text-sm font-semibold"
            >Reporte no disponible</span
          >
          <span
            v-else
            class="text-text-main line-clamp-2 min-w-0 flex-1 text-sm leading-snug font-semibold"
            >{{ props.report.title }}</span
          >
          <PillTag v-if="props.report.hasUpdates" tone="accent" data-report-new>Nuevo</PillTag>
        </span>

        <span
          v-if="followed"
          class="text-text-muted flex min-w-0 flex-wrap items-center gap-x-2 font-mono text-xs tabular-nums"
        >
          <span>#{{ props.report.number }}</span>
          <span aria-hidden="true">──▶</span>
          <span class="text-text-main font-semibold">#{{ followed.number }}</span>
        </span>

        <ReportStatus :entry="props.report" compact />
        <span class="text-text-muted font-mono text-xs tabular-nums">
          Enviado el {{ formatShortDate(props.report.submittedAt) }}
        </span>
      </span>
    </a>
  </li>
</template>
