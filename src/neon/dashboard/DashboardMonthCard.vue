<script setup lang="ts">
import { ref } from 'vue'

import NeonCard from '../ui/NeonCard.vue'
import NeonFigure from '../ui/NeonFigure.vue'
import NeonFitList from '../ui/NeonFitList.vue'
import type { NeonDashboardViewModel } from './view-model'

// «Te quedan»: the hero figure of the month, how the income split, the three
// month rows with their last six months, and the spending pace. Each month
// bar can be read: hovering or focusing it swaps the row's amount for that
// month's, and leaving it brings the current month back.
defineProps<{ month: NeonDashboardViewModel['month']; pendingCount: number }>()

/** The bar being read: its row and its place among the six months. */
const reading = ref<{ kind: string; index: number } | null>(null)

const SEGMENT_FILL = { expense: 'bg-text', investment: 'bg-lilac', unspent: 'bg-line' } as const
const ROW_DOT = { income: 'bg-gain', expense: 'bg-text', investment: 'bg-lilac' } as const
const ROW_TEXT = { income: 'text-gain', expense: 'text-text', investment: 'text-text' } as const
const TONE_TEXT = { gain: 'text-gain', loss: 'text-loss', neutral: 'text-text' } as const
</script>

<template>
  <NeonCard
    :title="month.leftLabel"
    title-id="dashboard-month-title"
    class="@container/month"
    data-dashboard-month
  >
    <template #actions>
      <span v-if="month.status" class="text-muted text-meta font-bold">{{ month.status }}</span>
    </template>

    <div class="flex flex-col gap-1.5">
      <NeonFigure
        :value="month.left.text"
        class="text-figure-hero @max-sm/month:text-figure-lg font-bold"
        :class="TONE_TEXT[month.left.tone]"
        data-dashboard-left
      />
      <span class="text-muted text-note text-pretty">
        de los {{ month.income }} que han entrado<template v-if="pendingCount">
          · {{ month.pendingNote }}</template
        >
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

    <NeonFitList>
      <li
        v-for="row in month.rows"
        :key="row.kind"
        class="border-line flex min-h-16 items-center gap-3 border-t py-2.5 @max-sm/month:grid @max-sm/month:grid-cols-[minmax(0,1fr)_auto] @max-sm/month:gap-y-1"
      >
        <span class="text-row flex min-w-0 flex-1 items-center gap-3 font-bold">
          <span
            class="size-2.5 shrink-0 rounded-[3px]"
            :class="ROW_DOT[row.kind]"
            aria-hidden="true"
          />
          {{ row.label }}
        </span>
        <span
          class="flex h-8 shrink-0 items-end @max-sm/month:col-span-2 @max-sm/month:row-start-2 @max-sm/month:h-5"
          role="group"
          :aria-label="`${row.label}, últimos seis meses`"
          @pointerleave="reading = null"
        >
          <button
            v-for="(bar, index) in row.bars"
            :key="bar.month"
            type="button"
            class="outline-accent flex h-full w-2.25 cursor-default items-end justify-center rounded-xs focus-visible:outline-2"
            :aria-label="`${bar.month}: ${bar.value}`"
            @pointerenter="reading = { kind: row.kind, index }"
            @focus="reading = { kind: row.kind, index }"
            @blur="reading = null"
          >
            <span
              class="block min-h-0.75 w-1.5 rounded-xs motion-safe:transition-opacity motion-safe:duration-160"
              :class="[
                ROW_DOT[row.kind],
                reading?.kind === row.kind
                  ? reading.index === index
                    ? 'opacity-100'
                    : 'opacity-30'
                  : bar.current
                    ? 'opacity-100'
                    : 'opacity-30',
              ]"
              :style="{ height: `${bar.height}%` }"
            />
          </button>
        </span>
        <span
          class="font-display text-figure-row min-w-31 shrink-0 text-end font-semibold whitespace-nowrap tabular-nums @max-sm/month:col-start-2 @max-sm/month:row-start-1 @max-sm/month:min-w-0"
          :class="ROW_TEXT[row.kind]"
        >
          {{ reading?.kind === row.kind ? row.bars[reading.index].value : row.amount }}
        </span>
      </li>
    </NeonFitList>

    <p
      v-if="month.pace"
      class="bg-panel2 text-muted text-note rounded-field px-3.5 py-3"
      data-dashboard-pace
    >
      {{ month.pace.lead
      }}<b class="font-extrabold" :class="TONE_TEXT[month.pace.tone]">{{ month.pace.emphasis }}</b
      >{{ month.pace.tail }}
    </p>
  </NeonCard>
</template>
