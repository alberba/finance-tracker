<script setup lang="ts">
import NeonCard from '../ui/NeonCard.vue'
import NeonFigure from '../ui/NeonFigure.vue'
import type { NeonDashboardViewModel } from './view-model'

// «Te quedan»: the hero figure of the month, how the income split, the three
// month rows with their last six months, and the spending pace.
defineProps<{ month: NeonDashboardViewModel['month'] }>()

const SEGMENT_FILL = { expense: 'bg-text', investment: 'bg-lilac', unspent: 'bg-line' } as const
const ROW_DOT = { income: 'bg-gain', expense: 'bg-text', investment: 'bg-lilac' } as const
const ROW_TEXT = { income: 'text-gain', expense: 'text-text', investment: 'text-text' } as const
const TONE_TEXT = { gain: 'text-gain', loss: 'text-loss', neutral: 'text-text' } as const
</script>

<template>
  <NeonCard :title="month.name" title-id="dashboard-month-title" data-dashboard-month>
    <template #actions>
      <span
        class="border-ctrl-line text-soft rounded-pill text-meta inline-flex min-h-7 items-center border px-2.5 font-extrabold"
      >
        {{ month.status }}
      </span>
    </template>

    <div class="flex flex-col gap-1.5">
      <span class="text-muted text-label tracking-label font-extrabold uppercase">{{
        month.leftLabel
      }}</span>
      <NeonFigure
        :value="month.left.text"
        class="text-figure-hero font-bold"
        :class="TONE_TEXT[month.left.tone]"
        data-dashboard-left
      />
      <span class="text-muted text-note">
        de los {{ month.income }} que han entrado · {{ month.pendingNote }}
      </span>
    </div>

    <div
      v-if="month.split"
      role="img"
      :aria-label="month.split.label"
      class="rounded-pill flex h-1.5 gap-0.75 overflow-hidden"
    >
      <span
        v-for="segment in month.split.segments"
        :key="segment.key"
        :class="SEGMENT_FILL[segment.key]"
        :style="{ flex: `${segment.weight} 1 0px` }"
      />
    </div>

    <ul>
      <li
        v-for="row in month.rows"
        :key="row.kind"
        class="border-line flex min-h-16 items-center gap-3 border-t py-2.5"
      >
        <span
          class="size-2.5 shrink-0 rounded-[3px]"
          :class="ROW_DOT[row.kind]"
          aria-hidden="true"
        />
        <span class="text-row min-w-0 flex-1 font-bold">{{ row.label }}</span>
        <span class="sr-only">{{ row.history }}</span>
        <span class="flex h-8 shrink-0 items-end gap-0.75" aria-hidden="true">
          <span
            v-for="bar in row.bars"
            :key="bar.month"
            class="block min-h-0.75 w-1.5 rounded-xs"
            :class="[ROW_DOT[row.kind], bar.current ? 'opacity-100' : 'opacity-30']"
            :style="{ height: `${bar.height}%` }"
            :title="`${bar.month}: ${bar.value}`"
          />
        </span>
        <span
          class="font-display text-figure-row min-w-31 shrink-0 text-end font-semibold whitespace-nowrap tabular-nums"
          :class="ROW_TEXT[row.kind]"
        >
          {{ row.amount }}
        </span>
      </li>
    </ul>

    <p
      v-if="month.pace"
      class="bg-panel2 text-muted text-note rounded-field mbs-auto px-3.5 py-3"
      data-dashboard-pace
    >
      {{ month.pace.lead
      }}<b class="font-extrabold" :class="TONE_TEXT[month.pace.tone]">{{ month.pace.emphasis }}</b
      >{{ month.pace.tail }}
    </p>
  </NeonCard>
</template>
