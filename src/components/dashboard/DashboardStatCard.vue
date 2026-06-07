<script setup lang="ts">
type DashboardStatVariant = 'income' | 'expense' | 'investment'

const props = defineProps<{
  variant: DashboardStatVariant
  label: string
  valueId: string
  deltaId: string
  sparkId: string
}>()

const variantStyles: Record<DashboardStatVariant, { accent: string; surface: string }> = {
  income: { accent: 'var(--income)', surface: 'var(--income-bg)' },
  expense: { accent: 'var(--expense)', surface: 'var(--expense-bg)' },
  investment: { accent: 'var(--invest)', surface: 'var(--invest-bg)' },
}

const styleVars = {
  '--dash-accent': variantStyles[props.variant].accent,
  '--dash-accent-surface': variantStyles[props.variant].surface,
}
</script>

<template>
  <article
    :class="[
      'relative flex min-w-0 items-center gap-3.5 rounded-xl bg-(--bg-panel) p-4 xl:py-2 shadow-(--shadow-soft)',
      `dash-stat--${variant}`,
    ]"
    :style="styleVars"
    :aria-label="label"
  >
    <div class="flex gap-2">
      <span
        class="grid aspect-square h-fit xl:h-10 xl:w-10 place-items-center rounded-sm bg-(--dash-accent-surface) text-(--dash-accent)"
        aria-hidden="true"
      >
        <slot name="icon" />
      </span>
      <div class="min-w-0 gap-1">
        <p
          class="font-semibold text-sm text-ellipsis text-(--text-muted)"
        >
          {{ label }}
        </p>
        <strong
          :id="valueId"
          class="text-2xl font-bold text-(--text-main)"
        >
          0,00 €
        </strong>
        <p
          :id="deltaId"
          class="flex flex-nowrap whitespace-nowrap items-center gap-0.5 xl:gap-1.5 text-[0.76rem] text-(--text-faint)"
        >
          <span class="dash-stat-delta-pre">Este mes</span>
          <span data-delta-tag class="dash-stat-delta-tag font-bold" hidden></span>
          <span data-delta-post class="dash-stat-delta-post" hidden></span>
        </p>
      </div>
    </div>
    <div class="-left-2 relative h-24 w-full max-w-96 py-2 min-w-12 mask-[linear-gradient(to_right,transparent,black)] max-xl:hidden">
      <canvas :id="sparkId" class="dash-spark h-full! w-full!"></canvas>
    </div>
  </article>
</template>
