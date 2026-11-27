<script setup lang="ts">
import { computed } from 'vue'

import type { Benchmark } from '../../../domain/investment/benchmarks'
import type { ReturnMode } from '../../../domain/investment/view-model'
import NeonChoiceMenu, { type ChoiceGroup } from '../../ui/NeonChoiceMenu.vue'
import { TONE_TEXT, type Tone } from './view-model'

// The line over the cover's chart: how the portfolio did, and how far it is
// from the index the chart draws, each a figure with one line under it. The
// index is picked from that line, in the lilac of its own line on the chart;
// how the return is measured, from the segmented control on the right.
const props = defineProps<{
  result: { value: string; caption: string; tone: Tone }
  difference: { text: string; tone: Tone } | null
  options: readonly Benchmark[]
  selected: string
  loading: boolean
  available: boolean
  method: ReturnMode
}>()

const emit = defineEmits<{ select: [id: string]; method: [method: ReturnMode] }>()

const METHODS: ReadonlyArray<{ value: ReturnMode; label: string; hint: string }> = [
  { value: 'simple', label: 'Simple', hint: 'Ganancia sobre lo que has puesto' },
  {
    value: 'twr',
    label: 'TWR',
    hint: 'Rentabilidad ponderada en el tiempo: no depende de cuándo aportas',
  },
]

const selectedName = computed(
  () => props.options.find((option) => option.id === props.selected)?.name ?? 'un índice',
)
const groups = computed<ChoiceGroup<string>[]>(() => [
  {
    key: 'index',
    value: props.selected,
    options: props.options.map(({ id, name }) => ({ value: id, label: name })),
  },
])

const FIGURE =
  'font-display motion-safe:animate-swap m-0 text-figure-lg leading-none font-semibold tracking-[-0.035em] whitespace-nowrap tabular-nums'
</script>

<template>
  <div
    class="relative z-20 flex flex-wrap items-end justify-between gap-x-8 gap-y-5"
    data-investment-figures
  >
    <dl class="m-0 flex flex-wrap items-end gap-y-5" aria-live="polite">
      <div class="grid gap-2.5 pe-[clamp(1.5rem,3cqi,3rem)]" data-investment-figure="return">
        <dt class="sr-only">Rentabilidad</dt>
        <dd :key="`${method}-${result.value}`" :class="[FIGURE, TONE_TEXT[result.tone]]">
          {{ result.value }}
        </dd>
        <dd class="text-muted m-0 text-base leading-snug font-semibold tabular-nums">
          {{ result.caption }}
        </dd>
      </div>
      <div
        class="border-line grid gap-2.5 border-s ps-[clamp(1.5rem,3cqi,3rem)]"
        data-investment-benchmark
      >
        <dt class="sr-only">Diferencia con {{ selectedName }}</dt>
        <dd
          v-if="difference"
          :key="`${selected}-${difference.text}`"
          :class="[FIGURE, TONE_TEXT[difference.tone]]"
        >
          {{ difference.text }}
        </dd>
        <dd
          class="text-muted m-0 flex flex-wrap items-baseline gap-x-1.5 text-base leading-snug font-semibold"
        >
          frente al
          <NeonChoiceMenu
            class="text-lilac"
            look="link"
            placement="start"
            :text="`Comparar con ${selectedName}`"
            :short-text="selectedName"
            label="Comparar con un índice"
            :groups="groups"
            @select="(_, id) => emit('select', id)"
          />
          <span v-if="loading" aria-live="polite">· cargando…</span>
          <span v-else-if="!available">· sin datos</span>
        </dd>
      </div>
    </dl>

    <div
      class="bg-panel2 rounded-pill flex gap-[3px] p-[3px]"
      role="group"
      aria-label="Cómo medir la rentabilidad"
    >
      <button
        v-for="option in METHODS"
        :key="option.value"
        type="button"
        :aria-pressed="method === option.value"
        :title="option.hint"
        class="rounded-pill outline-accent min-h-9 px-4 text-sm font-extrabold focus-visible:outline-2 focus-visible:outline-offset-2 motion-safe:transition-transform motion-safe:duration-140 motion-safe:active:scale-[0.97] pointer-coarse:min-h-11"
        :class="
          method === option.value
            ? 'bg-sel-bg text-sel-text'
            : 'text-soft pointer-fine:hover:text-text'
        "
        @click="emit('method', option.value)"
      >
        {{ option.label }}
      </button>
    </div>
  </div>
</template>
