<script setup lang="ts">
import type { InlineNode } from '../../domain/reports/report-markdown'

// Nodos inline del Markdown seguro. La recursión cubre negrita, cursiva,
// tachado y enlaces; nunca se inyecta HTML.
defineOptions({ name: 'ReportMarkdownInline' })
defineProps<{ nodes: InlineNode[] }>()
</script>

<template>
  <template v-for="(node, index) in nodes" :key="index">
    <template v-if="node.type === 'text'">{{ node.value }}</template>
    <code
      v-else-if="node.type === 'code'"
      class="bg-subtle text-text-main rounded-sm px-1.5 py-0.5 font-mono text-[0.9em] wrap-break-word"
      >{{ node.value }}</code
    >
    <strong v-else-if="node.type === 'strong'" class="font-bold"
      ><ReportMarkdownInline :nodes="node.children"
    /></strong>
    <em v-else-if="node.type === 'em'" class="italic"
      ><ReportMarkdownInline :nodes="node.children"
    /></em>
    <s v-else-if="node.type === 'del'" class="text-text-muted"
      ><ReportMarkdownInline :nodes="node.children"
    /></s>
    <a
      v-else-if="node.type === 'link'"
      :href="node.href"
      target="_blank"
      rel="noopener noreferrer"
      class="text-primary focus-visible:outline-primary font-semibold wrap-break-word underline decoration-1 underline-offset-2 focus-visible:outline-2"
      ><ReportMarkdownInline :nodes="node.children"
    /></a>
    <a
      v-else-if="node.type === 'image'"
      :href="node.src"
      target="_blank"
      rel="noopener noreferrer"
      class="focus-visible:outline-primary inline-block max-w-full align-top focus-visible:outline-2"
      ><img
        :src="node.src"
        :alt="node.alt"
        loading="lazy"
        referrerpolicy="no-referrer"
        class="border-line max-h-80 max-w-full rounded-md border object-contain"
    /></a>
  </template>
</template>
