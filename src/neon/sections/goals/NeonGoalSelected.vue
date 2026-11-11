<script setup lang="ts">
import NeonButton from '../../ui/NeonButton.vue'
import type { SelectedGoal } from './view-model'

// The selected goal under the columns: when it arrives at the amount on the
// slider, the slider itself («Aportas al mes») and, when the slider is off the
// amount that arrives right on the deadline, the button that sets it. Moving
// the slider only reads; letting it go saves the amount. In a narrow container
// (the mobile frame) it is one column: the goal, the slider, then the buttons.
defineProps<{ name: string; goal: SelectedGoal; amount: number }>()
const emit = defineEmits<{ slide: [amount: number]; save: [amount: number]; edit: [] }>()

function value(event: Event): number {
  return Number((event.target as HTMLInputElement).value) || 0
}
</script>

<template>
  <section
    class="bg-panel border-line rounded-card grid grid-cols-[minmax(0,1fr)] items-center gap-x-10 gap-y-5 border px-6 py-[22px] @max-lg:px-3 @max-lg:py-4 @2xl:grid-cols-[minmax(200px,1fr)_minmax(0,1.5fr)_auto]"
    aria-label="Objetivo seleccionado"
    data-goal-selected
  >
    <div class="grid min-w-0 gap-0.5">
      <p class="text-muted truncate text-[14px] font-bold">{{ name }}</p>
      <p class="font-display text-figure-block font-semibold tabular-nums">{{ goal.arrival }}</p>
      <p class="text-[14px] font-extrabold" :class="goal.late ? 'text-loss' : 'text-muted'">
        {{ goal.verdict }}
      </p>
    </div>
    <label class="grid gap-1.5">
      <span class="flex items-baseline justify-between gap-3">
        <span class="text-muted text-[13px] font-bold">Aportas al mes</span>
        <span class="font-display text-[20px] font-semibold tracking-[-0.02em] tabular-nums">
          {{ goal.monthly }}
        </span>
      </span>
      <input
        type="range"
        min="0"
        :max="goal.max"
        step="10"
        :value="amount"
        :aria-valuetext="goal.monthly"
        class="accent-accent min-h-11 w-full cursor-pointer"
        @input="emit('slide', value($event))"
        @change="emit('save', value($event))"
      />
    </label>
    <div class="flex flex-wrap gap-1 @2xl:min-w-[150px] @2xl:justify-end">
      <NeonButton v-if="goal.action" @click="emit('save', goal.action.amount)">
        {{ goal.action.label }}
      </NeonButton>
      <NeonButton @click="emit('edit')">Editar</NeonButton>
    </div>
  </section>
</template>
