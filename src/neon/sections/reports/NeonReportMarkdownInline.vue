<script setup lang="ts">
import type { InlineNode } from '../../../domain/reports/report-markdown'

// Inline nodes of the safe Markdown. The recursion covers bold, italic,
// strikethrough and links; HTML is never injected.
defineOptions({ name: 'NeonReportMarkdownInline' })
defineProps<{ nodes: InlineNode[] }>()
</script>

<template>
  <template v-for="(node, index) in nodes" :key="index">
    <template v-if="node.type === 'text'">{{ node.value }}</template>
    <code
      v-else-if="node.type === 'code'"
      class="bg-panel2 text-text rounded-[8px] px-1.5 py-0.5 font-mono text-[14px] wrap-break-word"
      >{{ node.value }}</code
    >
    <strong v-else-if="node.type === 'strong'" class="font-extrabold"
      ><NeonReportMarkdownInline :nodes="node.children"
    /></strong>
    <em v-else-if="node.type === 'em'" class="italic"
      ><NeonReportMarkdownInline :nodes="node.children"
    /></em>
    <s v-else-if="node.type === 'del'" class="text-muted"
      ><NeonReportMarkdownInline :nodes="node.children"
    /></s>
    <a
      v-else-if="node.type === 'link'"
      :href="node.href"
      target="_blank"
      rel="noopener noreferrer"
      class="outline-accent font-extrabold wrap-break-word underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2"
      ><NeonReportMarkdownInline :nodes="node.children"
    /></a>
    <a
      v-else-if="node.type === 'image'"
      :href="node.src"
      target="_blank"
      rel="noopener noreferrer"
      class="outline-accent inline-block max-w-full align-top focus-visible:outline-2 focus-visible:outline-offset-2"
      ><img
        :src="node.src"
        :alt="node.alt"
        loading="lazy"
        referrerpolicy="no-referrer"
        class="border-line rounded-field max-h-80 max-w-full border object-contain"
    /></a>
  </template>
</template>
