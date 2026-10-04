<script setup lang="ts">
// An on/off state that applies at once (active/paused): a checkbox with the
// switch role, a drawn track and, optionally, the state written beside it.
defineProps<{
  /** Accessible name of the switch, e.g. "Netflix activa". */
  label: string
  onText?: string
  offText?: string
}>()

const checked = defineModel<boolean>({ required: true })
</script>

<template>
  <label
    class="inline-flex min-h-11 min-w-11 cursor-pointer items-center gap-2.5 text-sm font-semibold"
  >
    <input
      v-model="checked"
      type="checkbox"
      role="switch"
      class="peer sr-only"
      :aria-label="label"
    />
    <span
      class="peer-focus-visible:outline-primary relative h-6 w-10 shrink-0 rounded-full transition-colors peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2"
      :class="checked ? 'bg-primary' : 'bg-line-strong'"
      aria-hidden="true"
    >
      <span
        class="bg-panel absolute top-1 left-1 size-4 rounded-full shadow-sm transition-transform"
        :class="{ 'translate-x-4': checked }"
      ></span>
    </span>
    <span v-if="onText || offText" :class="checked ? 'text-text-main' : 'text-text-muted'">
      {{ checked ? onText : offText }}
    </span>
  </label>
</template>
