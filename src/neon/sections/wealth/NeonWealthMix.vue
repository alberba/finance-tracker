<script setup lang="ts">
import NeonCard from '../../ui/NeonCard.vue'
import type { MixSegment, MixTone } from './view-model'

// «Dónde está»: what each asset weighs, as one bar and its legend.
defineProps<{ segments: MixSegment[]; note: string; label: string }>()

const TONE_CLASS: Record<MixTone, string> = {
  lilac: 'bg-lilac',
  lilac2: 'bg-lilac2',
  lilac3: 'bg-lilac3',
  peach: 'bg-peach',
}
</script>

<template>
  <NeonCard title="Dónde está" title-id="wealth-mix-title">
    <template #actions>
      <p class="text-muted text-note">{{ note }}</p>
    </template>
    <template v-if="segments.length">
      <div role="img" :aria-label="label" class="flex h-1.5 min-w-0 gap-[3px]">
        <span
          v-for="segment in segments"
          :key="segment.name"
          class="rounded-pill min-w-1.5"
          :class="TONE_CLASS[segment.tone]"
          :style="{ flex: `${segment.weight} 1 0` }"
        ></span>
      </div>
      <ul class="grid min-w-0 grid-cols-2 gap-x-5 gap-y-3 @min-[900px]:grid-cols-4">
        <li
          v-for="segment in segments"
          :key="segment.name"
          class="grid min-w-0 grid-cols-[auto_minmax(0,1fr)] items-baseline gap-x-2.5"
        >
          <span
            class="size-2.5 rounded-[3px]"
            :class="TONE_CLASS[segment.tone]"
            aria-hidden="true"
          ></span>
          <span class="grid min-w-0 gap-0.5">
            <span class="truncate text-[16px] font-bold">{{ segment.name }}</span>
            <span class="font-display text-[20px] font-semibold tracking-[-0.02em] tabular-nums">{{
              segment.value
            }}</span>
            <span class="text-muted text-meta">{{ segment.pct }} · {{ segment.note }}</span>
          </span>
        </li>
      </ul>
    </template>
  </NeonCard>
</template>
