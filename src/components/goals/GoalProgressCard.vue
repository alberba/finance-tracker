<script setup lang="ts">
import type { GoalProgressViewModel } from '../../domain/goals/view-model'

defineProps<{
  item: GoalProgressViewModel
  formatMoney: (value: number) => string
}>()

function toneClass(tone: 'good' | 'bad'): string {
  return tone === 'good' ? 'text-(--income)' : 'text-(--expense)'
}
</script>

<template>
  <article class="goal-progress-item">
    <strong>{{ item.goal.name || item.key }}</strong>
    <small>{{ item.goal.targetYear }}</small>
    <div class="progress-track">
      <div class="progress-fill" :style="{ width: `${item.progress.toFixed(2)}%` }"></div>
    </div>
    <div class="list-item">
      <span>Actual</span>
      <strong>{{ formatMoney(item.current) }}</strong>
    </div>
    <div class="list-item">
      <span>Objetivo</span>
      <strong>{{ formatMoney(item.target) }}</strong>
    </div>
    <div class="list-item">
      <span>Progreso</span>
      <strong>{{ item.progress.toFixed(2) }}%</strong>
    </div>
    <div class="list-item">
      <span>Faltan</span>
      <strong :class="toneClass(item.remainingTone)">{{ formatMoney(item.remaining) }}</strong>
    </div>
    <div class="list-item">
      <span>Necesitas/mes</span>
      <strong>{{ formatMoney(item.monthlyNeeded) }}</strong>
    </div>
  </article>
</template>
