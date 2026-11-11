<script setup lang="ts">
import type { DotTone } from './view-model'

// The round mark in front of a report status. The words carry the meaning and
// the dot only reinforces it, so it is hidden from assistive technology. With
// no tone it is a ring: there is no status to show.
defineProps<{ tone: DotTone | null; size?: 'sm' | 'md' }>()
</script>

<template>
  <span
    aria-hidden="true"
    class="shrink-0 rounded-full"
    :class="[
      size === 'md' ? 'size-2.5' : 'size-2',
      tone === 'accent' && 'bg-accent',
      tone === 'gain' && 'bg-gain',
      tone === 'muted' && 'bg-muted',
      tone === null && 'shadow-[inset_0_0_0_1.5px_var(--color-muted)]',
    ]"
  ></span>
</template>
