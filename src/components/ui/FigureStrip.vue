<script setup lang="ts">
import { TONE_TEXT, type Tone } from './tone'

export interface FigureStripItem {
  label: string
  value: string
  tone?: Tone
  suffix?: string
  /** A short line under the figure (what it is out of, until when). */
  note?: string
}

// Summary figures side by side, separated by rules; two columns on mobile.
defineProps<{ items: FigureStripItem[] }>()
</script>

<template>
  <dl class="grid grid-cols-2 gap-x-4 gap-y-5 sm:flex sm:gap-0">
    <div
      v-for="item in items"
      :key="item.label"
      class="sm:border-line grid content-start gap-1 sm:flex-1 sm:border-l sm:px-6 sm:first:border-l-0 sm:first:pl-0"
    >
      <dt class="text-text-muted text-sm">{{ item.label }}</dt>
      <dd
        class="font-display text-xl tabular-nums"
        :class="item.tone ? TONE_TEXT[item.tone] : 'text-text-main'"
      >
        {{ item.value }}
        <span v-if="item.suffix" class="text-text-muted font-sans text-sm">{{ item.suffix }}</span>
      </dd>
      <dd v-if="item.note" class="text-text-muted text-sm">{{ item.note }}</dd>
    </div>
  </dl>
</template>
