<script setup lang="ts">
import NeonCard from '../../ui/NeonCard.vue'
import type { MixSegment, MixTone } from './view-model'

// «Dónde está»: what each asset weighs. As a row (mobile), one bar and its
// legend; as a list (the desktop column beside the chart), one row per asset
// with its own bar of weight.
withDefaults(defineProps<{ segments: MixSegment[]; label: string; layout?: 'row' | 'list' }>(), {
  layout: 'row',
})

const TONE_CLASS: Record<MixTone, string> = {
  lilac: 'bg-lilac',
  lilac2: 'bg-lilac2',
  lilac3: 'bg-lilac3',
  peach: 'bg-peach',
}
</script>

<template>
  <NeonCard title="Dónde está" title-id="wealth-mix-title">
    <ul
      v-if="segments.length && layout === 'list'"
      role="list"
      :aria-label="label"
      class="grid min-w-0"
    >
      <li
        v-for="segment in segments"
        :key="segment.name"
        class="border-line grid min-w-0 grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-2.5 gap-y-2 py-3 not-first:border-t"
      >
        <span
          class="size-2.5 rounded-[3px]"
          :class="TONE_CLASS[segment.tone]"
          aria-hidden="true"
        ></span>
        <span class="grid min-w-0 gap-0.5">
          <span class="truncate text-[16px] font-bold">{{ segment.name }}</span>
          <span class="text-muted text-meta truncate"
            >{{ segment.value }} · {{ segment.note }}</span
          >
        </span>
        <span
          class="font-display text-soft text-[14px] font-semibold whitespace-nowrap tabular-nums"
          >{{ segment.pct }}</span
        >
        <span class="bg-line rounded-pill col-start-2 col-end-4 h-1" aria-hidden="true">
          <span
            class="rounded-pill block h-full"
            :class="TONE_CLASS[segment.tone]"
            :style="{ inlineSize: `${segment.weight * 100}%` }"
          ></span>
        </span>
      </li>
    </ul>
    <template v-else-if="segments.length">
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
    <p v-else class="text-muted text-note">Todavía no tienes activos con saldo.</p>
  </NeonCard>
</template>
