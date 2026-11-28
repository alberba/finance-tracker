<script setup lang="ts">
import { nextTick, onMounted, ref, useTemplateRef } from 'vue'

import { formatDecimalInput } from '../../../lib/number'
import { parseDraft } from './year-view-model'

// Inline editor of one month's plan (cell of the grid or row of the month
// list): a number field that saves on Enter, on leaving it or with its check
// button, and is dropped on Escape. An amount that is not a number keeps the
// field open, flagged, on Enter, and is dropped on leaving it.
const props = defineProps<{
  /** Saved plan, the starting text. */
  plan: number
  label: string
  saveLabel: string
  wide?: boolean
}>()
const emit = defineEmits<{ save: [value: number]; cancel: [] }>()

const text = ref(formatDecimalInput(props.plan))
const invalid = ref(false)
const input = useTemplateRef<HTMLInputElement>('input')
let finished = false

onMounted(() => {
  void nextTick(() => {
    input.value?.focus()
    input.value?.select()
  })
})

function commit(): boolean {
  if (finished) return true
  const value = parseDraft(text.value)
  invalid.value = value === null
  if (value === null) return false
  finished = true
  emit('save', value)
  return true
}

function cancel(): void {
  if (finished) return
  finished = true
  emit('cancel')
}

function onBlur(): void {
  if (!commit()) cancel()
}
</script>

<template>
  <span
    class="flex w-full items-center gap-1"
    :class="wide ? 'max-w-[200px]' : 'ms-auto max-w-[150px]'"
  >
    <input
      ref="input"
      v-model="text"
      type="text"
      inputmode="decimal"
      autocomplete="off"
      :aria-label="label"
      :aria-invalid="invalid"
      class="border-accent bg-panel text-text font-display rounded-field outline-accent aria-invalid:border-loss min-h-[46px] min-w-0 flex-1 border px-2.5 text-right text-[15px] font-semibold tabular-nums focus-visible:outline-2 focus-visible:outline-offset-2"
      @keydown.enter.prevent="commit"
      @keydown.esc.prevent.stop="cancel"
      @blur="onBlur"
    />
    <button
      type="button"
      class="bg-accent text-on-accent outline-text grid size-8 shrink-0 place-items-center rounded-full focus-visible:outline-2 focus-visible:outline-offset-2"
      :aria-label="saveLabel"
      @mousedown.prevent
      @click="commit"
    >
      <svg
        class="size-3.5"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
        aria-hidden="true"
      >
        <path d="M5 12.5l4.5 4.5L19 7.5" />
      </svg>
    </button>
  </span>
</template>
