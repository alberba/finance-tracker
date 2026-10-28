<script setup lang="ts">
import type { ReportEntry } from '../../domain/reports/report-entry'
import ReportListItem from './ReportListItem.vue'

// Lateral de la pantalla: filas con filete, sin cajas. Es una lista de enlaces.
const props = defineProps<{ reports: ReportEntry[]; selectedNumber: number | null }>()
defineEmits<{ select: [issueNumber: number] }>()
</script>

<template>
  <nav aria-label="Tus reportes">
    <ul class="border-line border-t" data-report-list>
      <ReportListItem
        v-for="report in props.reports"
        :key="report.number"
        :report="report"
        :selected="props.selectedNumber === report.number"
        @select="$emit('select', $event)"
      />
    </ul>
  </nav>
</template>
