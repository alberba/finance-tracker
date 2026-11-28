<script setup lang="ts">
import { instrumentHref } from './asset-route'
import type { PositionLine, UninstrumentedLine } from './asset-view-model'
import { SPARK_HEIGHT, SPARK_WIDTH, TONE_STROKE, TONE_TEXT } from './view-model'

// What an investment account holds: one line per instrument (a position, ADR
// 0011) with units, average buy price, value, what went in, the result and the
// weight inside the account. Desktop is a dense table with the value as the
// figure of each row; the mobile frame stacks each position as a short list.
// A position with no quote says so, quietly: its value is an estimate. The
// symbol of each one is a link to its instrument's detail (#561): a real
// address, so it opens in a tab and survives a reload, and it stretches over
// the whole row so the row is the tap target. What the account holds with no
// instrument (movements without units) closes the list as «Sin instrumento»,
// with no link: there is no detail to open.
withDefaults(
  defineProps<{
    positions: readonly PositionLine[]
    /** What the account holds with no instrument, as one more row; null when negligible. */
    uninstrumented?: UninstrumentedLine | null
    note: string | null
    stacked?: boolean
  }>(),
  { stacked: false, uninstrumented: null },
)

const emit = defineEmits<{ open: [instrumentId: string] }>()

const LINK =
  'text-text outline-accent min-w-0 truncate font-bold after:absolute after:inset-0 focus-visible:outline-2 focus-visible:outline-offset-[-2px]'

function onOpen(event: MouseEvent, instrumentId: string): void {
  // A modified click keeps the browser's own way of opening a link.
  if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return
  event.preventDefault()
  emit('open', instrumentId)
}

const COLUMNS =
  'grid-cols-[minmax(0,1.3fr)_minmax(0,0.8fr)_minmax(0,0.9fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.1fr)] gap-x-[clamp(0.625rem,1.5cqi,1.75rem)]'
</script>

<template>
  <section class="grid min-w-0 gap-3" aria-labelledby="asset-positions-title" data-asset-positions>
    <h2 id="asset-positions-title" class="text-block-title m-0 font-extrabold">Posiciones</h2>

    <ul v-if="stacked" class="m-0 list-none p-0">
      <li
        v-for="line in positions"
        :key="line.instrumentId"
        class="border-line relative grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-x-3 gap-y-1 border-t py-2.5"
        :data-asset-position-line="line.symbol"
      >
        <a
          :href="instrumentHref(line.instrumentId)"
          class="text-row"
          :class="LINK"
          @click="onOpen($event, line.instrumentId)"
        >
          {{ line.symbol }}
        </a>
        <span class="font-display text-figure-row text-end font-semibold tabular-nums">
          {{ line.value }}
        </span>
        <span class="text-muted text-meta min-w-0 font-bold tabular-nums">
          {{ line.units }} · media {{ line.averagePrice }}
        </span>
        <span class="text-meta text-end font-extrabold tabular-nums" :class="TONE_TEXT[line.tone]">
          {{ line.gain }}
          <span v-if="line.ret">{{ line.ret }}</span>
        </span>
        <span class="text-muted text-meta font-bold tabular-nums">
          Has puesto {{ line.invested }} · {{ line.weight }}
        </span>
        <span
          v-if="line.estimated"
          class="text-muted text-meta text-end font-bold"
          :title="note ?? undefined"
        >
          Sin cotización
        </span>
        <svg
          v-if="line.evolution"
          :viewBox="`0 0 ${SPARK_WIDTH} ${SPARK_HEIGHT}`"
          preserveAspectRatio="none"
          class="block overflow-visible"
          :class="'col-span-2 h-8 w-full'"
          role="img"
          :aria-label="line.evolution.label"
          :data-position-evolution="line.symbol"
        >
          <path
            :d="line.evolution.path"
            fill="none"
            :stroke="TONE_STROKE[line.tone]"
            stroke-width="2"
            stroke-linejoin="round"
            stroke-linecap="round"
            :stroke-dasharray="line.evolution.approximate ? '3 3' : undefined"
            vector-effect="non-scaling-stroke"
          />
        </svg>
      </li>
      <li
        v-if="uninstrumented"
        class="border-line grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-x-3 gap-y-1 border-t py-2.5"
        data-asset-uninstrumented
      >
        <span class="text-row text-soft min-w-0 truncate font-bold">Sin instrumento</span>
        <span class="font-display text-figure-row text-end font-semibold tabular-nums">
          {{ uninstrumented.value }}
        </span>
        <span class="text-muted text-meta min-w-0 font-bold tabular-nums">
          Has puesto {{ uninstrumented.invested }}
        </span>
        <span
          class="text-meta text-end font-extrabold tabular-nums"
          :class="TONE_TEXT[uninstrumented.tone]"
        >
          {{ uninstrumented.gain }}
          <span v-if="uninstrumented.ret">{{ uninstrumented.ret }}</span>
        </span>
      </li>
    </ul>

    <template v-else>
      <div
        class="text-muted text-label tracking-label grid pbe-2.5 font-extrabold uppercase"
        :class="COLUMNS"
        aria-hidden="true"
      >
        <span>Instrumento</span>
        <span class="text-end">Títulos</span>
        <span class="text-end">Precio medio</span>
        <span class="text-end">Valor</span>
        <span class="text-end">Invertido</span>
        <span class="text-end">Ganancia</span>
        <span class="text-end">Peso</span>
        <span class="text-end">Evolución</span>
      </div>
      <ul class="m-0 list-none p-0">
        <li
          v-for="line in positions"
          :key="line.instrumentId"
          class="border-line relative grid items-center border-t py-3.5"
          :class="COLUMNS"
          :data-asset-position-line="line.symbol"
        >
          <span class="grid min-w-0 gap-px">
            <a
              :href="instrumentHref(line.instrumentId)"
              class="text-row"
              :class="LINK"
              @click="onOpen($event, line.instrumentId)"
            >
              {{ line.symbol }}
            </a>
            <span
              v-if="line.estimated"
              class="text-muted text-meta font-bold"
              :title="note ?? undefined"
            >
              Sin cotización
            </span>
          </span>
          <span class="text-soft text-note text-end font-bold tabular-nums">{{ line.units }}</span>
          <span class="text-soft text-note text-end font-bold tabular-nums">
            {{ line.averagePrice }}
          </span>
          <span class="font-display text-figure-row text-end font-semibold tabular-nums">
            {{ line.value }}
          </span>
          <span class="text-soft text-note text-end font-bold tabular-nums">{{
            line.invested
          }}</span>
          <span
            class="flex flex-col items-end gap-px text-end tabular-nums"
            :class="TONE_TEXT[line.tone]"
          >
            <span class="text-note font-semibold">{{ line.gain }}</span>
            <span v-if="line.ret" class="text-meta font-extrabold">{{ line.ret }}</span>
          </span>
          <span class="text-soft text-note text-end font-bold tabular-nums">{{ line.weight }}</span>
          <span class="flex justify-end">
            <svg
              v-if="line.evolution"
              :viewBox="`0 0 ${SPARK_WIDTH} ${SPARK_HEIGHT}`"
              preserveAspectRatio="none"
              class="block overflow-visible"
              :class="'h-7 w-full max-w-28'"
              role="img"
              :aria-label="line.evolution.label"
              :data-position-evolution="line.symbol"
            >
              <path
                :d="line.evolution.path"
                fill="none"
                :stroke="TONE_STROKE[line.tone]"
                stroke-width="2"
                stroke-linejoin="round"
                stroke-linecap="round"
                :stroke-dasharray="line.evolution.approximate ? '3 3' : undefined"
                vector-effect="non-scaling-stroke"
              />
            </svg>
          </span>
        </li>
        <li
          v-if="uninstrumented"
          class="border-line grid items-center border-t py-3.5"
          :class="COLUMNS"
          data-asset-uninstrumented
        >
          <span class="text-soft text-row min-w-0 truncate font-bold">Sin instrumento</span>
          <span class="text-muted text-note text-end font-bold">—</span>
          <span class="text-muted text-note text-end font-bold">—</span>
          <span class="font-display text-figure-row text-end font-semibold tabular-nums">
            {{ uninstrumented.value }}
          </span>
          <span class="text-soft text-note text-end font-bold tabular-nums">{{
            uninstrumented.invested
          }}</span>
          <span
            class="flex flex-col items-end gap-px text-end tabular-nums"
            :class="TONE_TEXT[uninstrumented.tone]"
          >
            <span class="text-note font-semibold">{{ uninstrumented.gain }}</span>
            <span v-if="uninstrumented.ret" class="text-meta font-extrabold">{{
              uninstrumented.ret
            }}</span>
          </span>
          <span class="text-muted text-note text-end font-bold">—</span>
          <span></span>
        </li>
      </ul>
    </template>
  </section>
</template>
