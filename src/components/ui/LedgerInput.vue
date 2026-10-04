<script setup lang="ts">
// An amount typed straight into a ledger cell. It reads as a plain figure
// until hover or focus draws the field, and stays 44 px tall so a finger can
// hit it. The name is required: the column header alone does not say which
// row it belongs to. Other attributes (value, name, data-*, listeners, an
// `aria-invalid`) go to the input; the font size comes from the cell.
defineProps<{ label: string }>()
</script>

<template>
  <input
    type="text"
    inputmode="decimal"
    autocomplete="off"
    :aria-label="label"
    class="font-display text-text-main placeholder:text-text-muted hover:border-line-strong hover:bg-panel focus:border-primary focus:bg-panel aria-invalid:border-loss h-11 w-full min-w-0 rounded-md border border-transparent bg-transparent px-2 text-right font-medium tabular-nums outline-none focus:shadow-[0_0_0_3px_var(--ring)]"
  />
</template>
