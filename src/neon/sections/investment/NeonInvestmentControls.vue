<script setup lang="ts">
import { computed } from 'vue'

import type { ReturnMode } from '../../../domain/investment/view-model'
import type { Month } from '../../../lib/month'
import NeonChoiceMenu, { type ChoiceGroup } from '../../ui/NeonChoiceMenu.vue'
import type { PeriodOption } from './view-model'

// The two pills of the cover: the period the figures are measured at and how
// the return is measured. On the desktop frame they sit at the end of a row;
// on the mobile one (`compact`) they sit side by side in the middle, with
// short texts, and each menu opens toward the middle of the screen.
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
    :class="compact ? 'flex justify-center gap-2' : 'flex flex-wrap justify-end gap-x-5 gap-y-3'"
  >
    <NeonChoiceMenu
      :text="`Periodo · ${period?.label ?? ''}`"
      :short-text="compact ? period?.label : undefined"
      :placement="compact ? 'start' : 'end'"
      label="Periodo"
      :icon="ICON_PERIOD"
      :groups="periodGroups"
      @select="(_, value) => emit('month', value)"
    />
    <NeonChoiceMenu
      :text="method === 'twr' ? 'Rentabilidad TWR' : 'Rentabilidad simple'"
      :short-text="compact ? (method === 'twr' ? 'TWR' : 'Simple') : undefined"
      label="Cómo medir la rentabilidad"
      :icon="ICON_METHOD"
      :groups="methodGroups"
      @select="(_, value) => emit('method', value)"
    />
  </div>
</template>
