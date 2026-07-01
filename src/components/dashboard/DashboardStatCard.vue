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
    class="flex min-w-0 items-center gap-3.5 rounded-xl bg-(--bg-panel) p-4 shadow-(--shadow-soft) xl:py-2"
    :style="styleVars"
    :aria-label="label"
  >
    <div class="flex gap-2">
      <span
        class="grid aspect-square h-fit place-items-center rounded-sm bg-(--dash-accent-surface) text-(--dash-accent) xl:h-10 xl:w-10"
        aria-hidden="true"
      >
        <slot name="icon" />
      </span>
      <div class="min-w-0">
        <p class="text-text-muted text-sm font-semibold">
          {{ label }}
        </p>
        <strong :id="valueId" class="text-text-main text-2xl font-bold">
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
      class="relative -left-2 h-24 w-full max-w-96 min-w-12 mask-[linear-gradient(to_right,transparent,black)] py-2 max-xl:hidden"
    >
      <canvas :id="sparkId" ref="canvas" class="h-full! w-full!"></canvas>
    </div>
  </article>
</template>
