<script setup lang="ts">
import { computed } from 'vue'

import { parseReportMarkdown } from '../../../domain/reports/report-markdown'
import NeonReportMarkdownBlocks from './NeonReportMarkdownBlocks.vue'

// Markdown of a thread entry, without `v-html`: the AST is walked and Vue
// escapes the text. Headings are flattened to paragraphs so the page keeps its
// own hierarchy.
const props = defineProps<{ source: string }>()

const blocks = computed(() => parseReportMarkdown(props.source))
</script>

<template>
  <div class="text-text min-w-0">
    <NeonReportMarkdownBlocks :blocks="blocks" />
  </div>
</template>
