<script setup lang="ts">
import { computed } from 'vue'

import type { ReturnMode } from '../../../domain/investment/view-model'
import type { Month } from '../../../lib/month'
import NeonChoiceMenu, { type ChoiceGroup } from '../../ui/NeonChoiceMenu.vue'
import type { PeriodOption } from './view-model'

// The period and return method share a row with the benchmark on desktop.
// On mobile the two menus open above their centered controls.
const props = defineProps<{
  periods: readonly PeriodOption[]
  month: Month
  method: ReturnMode
  compact?: boolean
}>()

const emit = defineEmits<{ month: [month: Month]; method: [method: ReturnMode] }>()

const ICON_METHOD = 'M4 7h9M17 7h3M4 17h3M11 17h9M15 5v4M9 15v4'
const ICON_PERIOD = 'M4 6h16v14H4zM4 10h16M8 3v4M16 3v4'

const period = computed(() => props.periods.find((option) => option.value === props.month))
const periodGroups = computed<ChoiceGroup<Month>[]>(() => [
  { key: 'month', value: props.month, options: props.periods },
])
const methodGroups = computed<ChoiceGroup<ReturnMode>[]>(() => [
  {
    key: 'method',
    value: props.method,
    options: [
      { value: 'simple', label: 'Simple', hint: 'Ganancia sobre lo que has puesto' },
      {
        value: 'twr',
        label: 'TWR',
        hint: 'Rentabilidad ponderada en el tiempo: no depende de cuándo aportas',
      },
    ],
  },
])
</script>

<template>
  <div
    :class="
      compact
        ? 'relative z-20 flex flex-wrap gap-2 px-4'
        : 'relative z-20 flex flex-wrap items-center gap-2'
    "
    role="group"
    aria-label="Controles de la gráfica"
  >
    <NeonChoiceMenu
      :text="`Periodo · ${period?.label ?? ''}`"
      :short-text="period?.label"
      :placement="compact ? 'above-center' : 'start'"
      label="Periodo"
      :icon="ICON_PERIOD"
      :groups="periodGroups"
      @select="(_, value) => emit('month', value)"
    />
    <NeonChoiceMenu
      :text="method === 'twr' ? 'Rentabilidad TWR' : 'Rentabilidad simple'"
      :short-text="method === 'twr' ? 'TWR' : 'Simple'"
      :placement="compact ? 'above-center' : 'start'"
      label="Cómo medir la rentabilidad"
      :icon="ICON_METHOD"
      :groups="methodGroups"
      @select="(_, value) => emit('method', value)"
    />
    <slot />
  </div>
</template>
