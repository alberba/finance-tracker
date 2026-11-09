<script setup lang="ts">
// Icon in a circle at the start of a ledger row (DESIGN.md, «Fila de libro
// mayor» and Iconografía): a 20px line icon on a 40px --color-panel2 circle.
// `path` is the icon's `d`, usually from category-icons.ts.
defineProps<{ path: string }>()
</script>

<template>
  <span
    class="bg-panel2 text-text grid size-10 shrink-0 place-items-center rounded-full"
    aria-hidden="true"
  >
    <svg
      class="size-5"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
    >
      <path :d="path" />
    </svg>
  </span>
</template>
