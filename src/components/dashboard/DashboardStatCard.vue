<script setup lang="ts">
import { computed, nextTick, useTemplateRef, watch } from 'vue'

import { renderSparkline } from '../../scripts/charts'
import type { DashboardStatDelta } from '../../domain/dashboard/view-model'

type DashboardStatVariant = 'income' | 'expense' | 'investment'

const props = defineProps<{
  variant: DashboardStatVariant
  label: string
  value: string
  valueId: string
  deltaId: string
  sparkId: string
  delta: DashboardStatDelta | null
  sparkValues: number[]
}>()

const variantStyles: Record<
  DashboardStatVariant,
  { accent: string; fallback: string; surface: string }
> = {
  income: { accent: 'var(--income)', fallback: '#0E9F6E', surface: 'var(--income-bg)' },
  expense: { accent: 'var(--expense)', fallback: '#E0463F', surface: 'var(--expense-bg)' },
  investment: { accent: 'var(--invest)', fallback: '#6A52E8', surface: 'var(--invest-bg)' },
}

const canvas = useTemplateRef<HTMLCanvasElement>('canvas')

const styleVars = computed(() => ({
  '--dash-accent': variantStyles[props.variant].accent,
  '--dash-accent-surface': variantStyles[props.variant].surface,
}))

const deltaToneClass = computed(() => {
  if (!props.delta) {
    return ''
  }
  if (props.delta.tone === 'good') {
    return 'text-(--income)'
  }
  if (props.delta.tone === 'bad') {
    return 'text-(--expense)'
  }
  return 'text-text-faint'
})

watch(() => [props.sparkValues, props.variant] as const, renderChart, {
  deep: true,
  immediate: true,
})

async function renderChart(): Promise<void> {
  await nextTick()
  if (!canvas.value) {
    return
  }
  renderSparkline(canvas.value, props.sparkValues, cssColor(variantStyles[props.variant]))
}

function cssColor(style: { accent: string; fallback: string }): string {
  const match = /^var\((--[^)]+)\)$/.exec(style.accent)
  if (!match || typeof window === 'undefined') {
    return style.fallback
  }
  return (
    getComputedStyle(document.documentElement).getPropertyValue(match[1]).trim() || style.fallback
  )
}
</script>

<template>
  <article
    class="relative flex min-w-0 items-center gap-4 overflow-hidden rounded-xl border border-(--line) bg-(--bg-panel) p-4 shadow-(--shadow-soft) sm:p-5 xl:min-h-32"
    :style="styleVars"
    :aria-label="label"
  >
    <div class="flex min-w-0 flex-1 gap-3">
      <span
        class="grid size-11 shrink-0 place-items-center rounded-lg bg-(--dash-accent-surface) text-(--dash-accent)"
        aria-hidden="true"
      >
        <slot name="icon" />
      </span>
      <div class="min-w-0 flex-1">
        <p class="text-text-muted text-sm font-semibold">
          {{ label }}
        </p>
        <strong
          :id="valueId"
          class="text-text-main block max-w-full font-mono text-[clamp(1.35rem,6vw,1.75rem)] leading-tight font-medium tracking-[-0.04em] [overflow-wrap:anywhere]"
        >
          {{ value }}
        </strong>
        <p
          :id="deltaId"
          class="text-text-faint flex flex-nowrap items-center gap-0.5 text-[0.76rem] whitespace-nowrap xl:gap-1.5"
        >
          <span>Este mes</span>
          <span v-if="delta" class="font-bold" :class="deltaToneClass">
            {{ delta.tag }}
          </span>
          <span v-if="delta">
            {{ delta.post }}
          </span>
        </p>
      </div>
    </div>
    <div
      class="relative -left-2 hidden h-24 w-40 shrink-0 mask-[linear-gradient(to_right,transparent,black)] py-2 2xl:block"
    >
      <canvas :id="sparkId" ref="canvas" class="h-full! w-full!"></canvas>
    </div>
  </article>
</template>
