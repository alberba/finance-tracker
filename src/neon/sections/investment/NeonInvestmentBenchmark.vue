<script setup lang="ts">
import { computed } from 'vue'

import type { Benchmark } from '../../../domain/investment/benchmarks'
import NeonChoiceMenu, { type ChoiceGroup } from '../../ui/NeonChoiceMenu.vue'
import { TONE_TEXT, type Tone } from './view-model'

const INDEX_ICON = 'M3 17l6-6 4 3 8-8M16 6h5v5'

const props = defineProps<{
  options: readonly Benchmark[]
  selected: string
  loading: boolean
  available: boolean
  difference: { text: string; tone: Tone } | null
}>()

const emit = defineEmits<{ select: [id: string] }>()

const selectedName = computed(
  () => props.options.find((option) => option.id === props.selected)?.name,
)
const groups = computed<ChoiceGroup<string>[]>(() => [
  {
    key: 'index',
    value: props.selected,
    options: props.options.map(({ id, name }) => ({ value: id, label: name })),
  },
])
</script>

<template>
  <div class="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2" data-investment-benchmark>
    <NeonChoiceMenu
      :text="`Comparar con ${selectedName ?? 'un índice'}`"
      :short-text="selectedName"
      label="Comparar con un índice"
      placement="start"
      :icon="INDEX_ICON"
      :groups="groups"
      @select="(_, id) => emit('select', id)"
    />
    <p class="text-muted m-0 text-base leading-snug" aria-live="polite">
      <template v-if="loading">Cargando {{ selectedName }}…</template>
      <template v-else-if="!available">
        <span class="sr-only">{{ selectedName }}.</span> Sin datos para este periodo
      </template>
      <template v-else-if="difference">
        Diferencia<span class="sr-only"> con {{ selectedName }}</span>
        <strong class="ms-1 tabular-nums" :class="TONE_TEXT[difference.tone]">
          {{ difference.text }}
        </strong>
      </template>
    </p>
  </div>
</template>
