<script setup lang="ts">
// A block of «Mis reportes» (DESIGN.md, Tarjeta): the panel with its 22px
// radius and the card padding, narrower in a small container. The caller adds
// the gap and the rest of its layout with `class`.
</script>

<template>
  <section
    class="bg-panel border-line rounded-card flex min-w-0 flex-col border px-6 py-[22px] @max-lg:px-3 @max-lg:py-4"
  >
    <slot />
  </section>
</template>
