<script setup lang="ts">
// Header of a detail (DESIGN.md, «Cabecera de detalle»): when an element of a
// section opens (an asset), the top bar keeps only the arrow and the symbol,
// «‹ VWCE». The arrow goes back to the section. No section title, no controls
// on the right, and the screen does not repeat the back row.
defineProps<{
  /** The element's symbol or short name («VWCE»). */
  label: string
  /** Where the arrow goes: the section the element belongs to. */
  backHref: string
  /** That section's name, for the arrow's accessible name («Inversión»). */
  backLabel: string
}>()
</script>

<template>
  <div class="flex min-w-0 items-center gap-1">
    <a
      :href="backHref"
      class="text-soft outline-accent grid size-12 shrink-0 place-items-center rounded-full focus-visible:outline-2 focus-visible:outline-offset-2 motion-safe:transition-transform motion-safe:duration-160 motion-safe:ease-out motion-safe:active:scale-[0.97]"
      :aria-label="`Volver a ${backLabel}`"
    >
      <svg
        class="size-[22px]"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
        aria-hidden="true"
      >
        <path d="m15 18-6-6 6-6" />
      </svg>
    </a>
    <h1 class="font-display text-h1-detail tracking-h1 truncate leading-[1.15] font-bold">
      {{ label }}
    </h1>
  </div>
</template>
