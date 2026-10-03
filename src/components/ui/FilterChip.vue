<script setup lang="ts">
// An on/off filter as a chip: a real checkbox, hidden, under a styled label.
// The dot repeats the color the filtered items carry elsewhere.
defineProps<{
  label: string
  /** A color or token reference for the leading dot; a data value, so inline. */
  dot?: string
}>()

const checked = defineModel<boolean>({ required: true })
</script>

<template>
  <label
    class="has-focus-visible:outline-primary inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-full border px-4 text-sm font-semibold transition-colors select-none has-focus-visible:outline-2 has-focus-visible:outline-offset-2"
    :class="
      checked
        ? 'border-primary bg-primary/10 text-text-main'
        : 'border-line-strong bg-panel text-text-muted hover:text-text-main'
    "
  >
    <input v-model="checked" type="checkbox" class="sr-only" />
    <span
      v-if="dot"
      class="size-2 rounded-full"
      :class="{ 'opacity-40': !checked }"
      :style="{ background: dot }"
      aria-hidden="true"
    ></span>
    {{ label }}
  </label>
</template>
