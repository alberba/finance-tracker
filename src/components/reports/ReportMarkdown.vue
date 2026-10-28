<script setup lang="ts">
import { computed } from 'vue'

import { parseReportMarkdown } from '../../domain/reports/report-markdown'
import ReportMarkdownInline from './ReportMarkdownInline.vue'

// Markdown de una aclaración, sin `v-html`: se recorre el AST y Vue escapa el
// texto. Los encabezados se allanan a párrafos para no romper la jerarquía.
const props = defineProps<{ source: string }>()

const blocks = computed(() => parseReportMarkdown(props.source))

const HEADING = ['text-base', 'text-base', 'text-lg', 'text-lg', 'text-xl', 'text-xl'] as const
</script>

<template>
  <div class="min-w-0 [&>*]:mbs-0 [&>*+*]:mbs-3">
    <template v-for="(block, index) in blocks" :key="index">
      <p
        v-if="block.type === 'paragraph'"
        class="text-text-main text-[0.9375rem] leading-relaxed wrap-break-word"
      >
        <ReportMarkdownInline :nodes="block.children" />
      </p>
      <p
        v-else-if="block.type === 'heading'"
        class="font-display text-text-main leading-snug font-bold"
        :class="HEADING[block.level - 1]"
      >
        <ReportMarkdownInline :nodes="block.children" />
      </p>
      <blockquote
        v-else-if="block.type === 'quote'"
        class="border-line-strong text-text-muted pis-3 border-s-2"
      >
        <div class="[&>*]:mbs-0 [&>*+*]:mbs-2">
          <template v-for="(nested, nestedIndex) in block.blocks" :key="nestedIndex">
            <p
              v-if="nested.type === 'paragraph'"
              class="text-[0.9375rem] leading-relaxed wrap-break-word"
            >
              <ReportMarkdownInline :nodes="nested.children" />
            </p>
            <p v-else-if="nested.type === 'heading'" class="text-text-main font-semibold">
              <ReportMarkdownInline :nodes="nested.children" />
            </p>
          </template>
        </div>
      </blockquote>
      <ul v-else-if="block.type === 'list' && !block.ordered" class="grid gap-1.5 ps-5">
        <li
          v-for="(item, itemIndex) in block.items"
          :key="itemIndex"
          class="text-text-main list-disc text-[0.9375rem] leading-relaxed wrap-break-word"
          :class="item.depth > 0 ? 'ms-4' : ''"
        >
          <ReportMarkdownInline :nodes="item.children" />
        </li>
      </ul>
      <ol v-else-if="block.type === 'list'" class="grid gap-1.5 ps-5">
        <li
          v-for="(item, itemIndex) in block.items"
          :key="itemIndex"
          class="text-text-main list-decimal text-[0.9375rem] leading-relaxed wrap-break-word"
          :class="item.depth > 0 ? 'ms-4' : ''"
        >
          <ReportMarkdownInline :nodes="item.children" />
        </li>
      </ol>
      <pre
        v-else-if="block.type === 'code'"
        class="bg-subtle border-line overflow-x-auto rounded-md border p-3 text-[0.8125rem] leading-relaxed"
      ><code class="font-mono">{{ block.value }}</code></pre>
      <hr v-else-if="block.type === 'rule'" class="border-line" />
    </template>
  </div>
</template>
