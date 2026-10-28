<script setup lang="ts">
import { computed } from 'vue'

import type { ReportEntry, ReportIssueRef } from '../../domain/reports/report-entry'
import { describeReportStatus, issueStateWord } from '../../domain/reports/report-status'
import StatusDot from '../ui/StatusDot.vue'

// Estado de un reporte: las palabras llevan el significado y el punto lo
// refuerza. Única fuente de textos para lista, detalle y demo.
const props = withDefaults(defineProps<{ entry: ReportEntry; compact?: boolean }>(), {
  compact: false,
})

const description = computed(() => describeReportStatus(props.entry))

const headline = computed(() => {
  if (
    description.value.state &&
    props.entry.unavailable !== true &&
    'followed' in props.entry &&
    props.entry.followed
  ) {
    return `${description.value.headline} · ${issueStateWord(description.value.state)}`
  }
  return description.value.headline
})
</script>

<template>
  <div class="grid min-w-0 gap-1.5" :data-report-status="entry.number">
    <p class="min-w-0 text-sm">
      <StatusDot v-if="description.state" :tone="description.tone" :label="headline">
        <span class="text-text-main font-semibold">{{ headline }}</span>
      </StatusDot>
      <span v-else class="text-text-main font-semibold">{{ headline }}</span>
    </p>
    <p v-if="description.secondary" class="text-text-muted font-mono text-xs tabular-nums">
      {{ description.secondary }}
    </p>
    <p
      v-if="!compact && entry.unavailable !== true && entry.followed"
      class="text-text-main flex flex-wrap items-center gap-x-2 font-mono text-sm tabular-nums"
    >
      <span class="text-text-muted line-through">#{{ entry.number }}</span>
      <span aria-hidden="true">──▶</span>
      <span class="font-semibold">#{{ entry.followed.number }}</span>
    </p>
    <p
      v-if="description.warning"
      class="bg-notice text-notice-text rounded-sm px-2.5 py-1.5 text-sm leading-snug"
      role="note"
    >
      {{ description.warning }}
    </p>
  </div>
</template>
