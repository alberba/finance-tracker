<script setup lang="ts">
import { ISSUE_ATTACHMENT_TYPES } from '../../../domain/reports/issue-attachments'

// «Añadir capturas»: a pill that is a label around a visually hidden file
// input, so a click, the keyboard and a screen reader all reach the input.
defineProps<{ disabled?: boolean }>()
defineEmits<{ pick: [event: Event] }>()
</script>

<template>
  <label
    class="border-ctrl-line has-[:focus-visible]:outline-accent text-note relative inline-flex min-h-11 cursor-pointer items-center gap-2 self-start rounded-full border px-4 font-extrabold has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-50 has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 motion-safe:transition-transform motion-safe:duration-160 motion-safe:ease-out motion-safe:active:scale-[0.97]"
  >
    <svg
      class="size-[18px] shrink-0"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
    >
      <path
        d="M20 11.5l-8 8a5 5 0 0 1-7-7l8.5-8.5a3.5 3.5 0 0 1 5 5L10 17.5a2 2 0 0 1-3-3l7.5-7.5"
      />
    </svg>
    Añadir capturas
    <input
      type="file"
      multiple
      :accept="ISSUE_ATTACHMENT_TYPES.join(',')"
      :disabled="disabled"
      class="sr-only"
      @change="$emit('pick', $event)"
    />
  </label>
</template>
