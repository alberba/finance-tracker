<script setup lang="ts">
import { computed } from 'vue'

import { parseReportMarkdown } from '../../domain/reports/report-markdown'
import ReportMarkdownBlocks from './ReportMarkdownBlocks.vue'

// Markdown de una aclaración, sin `v-html`: se recorre el AST y Vue escapa el
// texto. Los encabezados se allanan a párrafos para no romper la jerarquía.
const props = defineProps<{ source: string }>()

const blocks = computed(() => parseReportMarkdown(props.source))
</script>

<template>
  <div class="text-text-main min-w-0">
    <ReportMarkdownBlocks :blocks="blocks" />
  </div>
</template>
