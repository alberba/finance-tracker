<script setup lang="ts">
import type { BlockNode } from '../../../domain/reports/report-markdown'
import NeonReportMarkdownInline from './NeonReportMarkdownInline.vue'

// Blocks of the safe Markdown. Also used inside a quote, so lists, code, rules
// and nested quotes survive; the color comes from the container.
defineOptions({ name: 'NeonReportMarkdownBlocks' })
defineProps<{ blocks: BlockNode[] }>()
</script>

<template>
  <div class="[&>*]:mbs-0 [&>*+*]:mbs-3">
    <template v-for="(block, index) in blocks" :key="index">
      <p
        v-if="block.type === 'paragraph'"
        class="max-w-[68ch] text-[16px] leading-normal wrap-break-word"
      >
        <NeonReportMarkdownInline :nodes="block.children" />
      </p>
      <p
        v-else-if="block.type === 'heading'"
        class="max-w-[68ch] text-[16px] leading-normal font-extrabold wrap-break-word"
      >
        <NeonReportMarkdownInline :nodes="block.children" />
      </p>
      <blockquote
        v-else-if="block.type === 'quote'"
        class="border-ctrl-line text-soft pis-3 border-s-2"
      >
        <NeonReportMarkdownBlocks :blocks="block.blocks" />
      </blockquote>
      <ul v-else-if="block.type === 'list' && !block.ordered" class="grid gap-1.5 ps-5">
        <li
          v-for="(item, itemIndex) in block.items"
          :key="itemIndex"
          class="list-disc text-[16px] leading-normal wrap-break-word"
          :class="item.depth > 0 ? 'ms-4' : ''"
        >
          <NeonReportMarkdownInline :nodes="item.children" />
        </li>
      </ul>
      <ol v-else-if="block.type === 'list'" class="grid gap-1.5 ps-5">
        <li
          v-for="(item, itemIndex) in block.items"
          :key="itemIndex"
          class="list-decimal text-[16px] leading-normal wrap-break-word"
          :class="item.depth > 0 ? 'ms-4' : ''"
        >
          <NeonReportMarkdownInline :nodes="item.children" />
        </li>
      </ol>
      <pre
        v-else-if="block.type === 'code'"
        class="bg-panel2 border-line rounded-field overflow-x-auto border p-3 text-[13px] leading-relaxed"
      ><code class="font-mono">{{ block.value }}</code></pre>
      <hr v-else-if="block.type === 'rule'" class="border-line" />
    </template>
  </div>
</template>
