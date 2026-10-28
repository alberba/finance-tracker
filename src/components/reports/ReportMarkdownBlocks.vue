<script setup lang="ts">
import type { BlockNode } from '../../domain/reports/report-markdown'
import ReportMarkdownInline from './ReportMarkdownInline.vue'

// Bloques del Markdown seguro. Se usa también dentro de una cita para no perder
// listas, código, reglas ni citas anidadas; el color lo hereda del contenedor.
defineOptions({ name: 'ReportMarkdownBlocks' })
defineProps<{ blocks: BlockNode[] }>()

const HEADING = ['text-base', 'text-base', 'text-lg', 'text-lg', 'text-xl', 'text-xl'] as const
</script>

<template>
  <div class="[&>*]:mbs-0 [&>*+*]:mbs-3">
    <template v-for="(block, index) in blocks" :key="index">
      <p v-if="block.type === 'paragraph'" class="text-[0.9375rem] leading-relaxed wrap-break-word">
        <ReportMarkdownInline :nodes="block.children" />
      </p>
      <p
        v-else-if="block.type === 'heading'"
        class="font-display leading-snug font-bold"
        :class="HEADING[block.level - 1]"
      >
        <ReportMarkdownInline :nodes="block.children" />
      </p>
      <blockquote
        v-else-if="block.type === 'quote'"
        class="border-line-strong text-text-muted pis-3 border-s-2"
      >
        <ReportMarkdownBlocks :blocks="block.blocks" />
      </blockquote>
      <ul v-else-if="block.type === 'list' && !block.ordered" class="grid gap-1.5 ps-5">
        <li
          v-for="(item, itemIndex) in block.items"
          :key="itemIndex"
          class="list-disc text-[0.9375rem] leading-relaxed wrap-break-word"
          :class="item.depth > 0 ? 'ms-4' : ''"
        >
          <ReportMarkdownInline :nodes="item.children" />
        </li>
      </ul>
      <ol v-else-if="block.type === 'list'" class="grid gap-1.5 ps-5">
        <li
          v-for="(item, itemIndex) in block.items"
          :key="itemIndex"
          class="list-decimal text-[0.9375rem] leading-relaxed wrap-break-word"
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
