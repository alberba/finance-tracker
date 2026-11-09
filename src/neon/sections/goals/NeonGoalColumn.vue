<script setup lang="ts">
import type { GoalColumn } from './view-model'

// One goal as a column (artboard «Objetivos · 2560 px»): the share saved on
// top, a tube filled with what is saved, the lighter part the monthly amount
// adds by the deadline, the hatched gap it leaves short, and the dashed mark
// of where an even pace would be today. Below, when it arrives and how late.
// Pressing it selects the goal.
defineProps<{ column: GoalColumn; selected: boolean }>()
defineEmits<{ select: [] }>()
</script>

<template>
  <button
    type="button"
    :aria-pressed="selected"
    :data-goal-column="column.name"
    class="rounded-card outline-accent flex h-full w-full flex-col items-center gap-[22px] border px-6 py-[22px] text-center focus-visible:outline-2 focus-visible:outline-offset-2 motion-safe:transition-transform motion-safe:duration-140 motion-safe:ease-out motion-safe:active:scale-[0.98]"
    :class="selected ? 'bg-panel2 border-ctrl-line' : 'bg-panel border-line'"
    @click="$emit('select')"
  >
    <span class="font-display text-figure-lg font-semibold tabular-nums" data-goal-percent>
      {{ column.percent }}
    </span>
    <span
      class="bg-bg relative block h-95 w-28 rounded-[20px] shadow-[inset_0_0_0_1px_var(--color-ctrl-line)]"
      aria-hidden="true"
    >
      <span
        class="bg-neutral-bar absolute inset-x-0 bottom-0 rounded-[20px] opacity-50"
        :style="{ height: `${column.tube.projected}%` }"
      ></span>
      <span
        class="bg-neutral-bar absolute inset-x-0 bottom-0 rounded-[20px]"
        :style="{ height: `${column.tube.saved}%` }"
      ></span>
      <span
        v-if="column.tube.short > 0"
        class="goal-short absolute inset-x-0 top-0 rounded-t-[20px]"
        :style="{ height: `${column.tube.short}%` }"
      ></span>
      <span
        v-if="column.tube.today !== null"
        class="border-faint absolute -inset-x-3 -mb-px border-t border-dashed"
        :style="{ bottom: `${column.tube.today}%` }"
      ></span>
    </span>
    <span class="grid justify-items-center gap-1">
      <span class="text-block-title font-extrabold">{{ column.name }}</span>
      <span class="font-display text-figure-block font-semibold tabular-nums">
        {{ column.arrival }}
      </span>
      <span
        class="text-[14px] font-extrabold"
        :class="column.late ? 'text-loss' : 'text-muted'"
        data-goal-verdict
      >
        {{ column.verdict }}
      </span>
    </span>
  </button>
</template>

<style scoped>
/* What the monthly amount leaves short by the deadline: a hatch in the loss hue. */
.goal-short {
  background: repeating-linear-gradient(135deg, var(--color-loss) 0 2px, transparent 2px 9px);
  opacity: 0.55;
}
</style>
