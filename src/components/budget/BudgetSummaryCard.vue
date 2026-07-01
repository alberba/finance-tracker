<script setup lang="ts">
defineProps<{
  label: string
  value: string
  tone?: 'good' | 'bad'
}>()

function toneClass(tone?: 'good' | 'bad'): string {
  if (!tone) return ''
  return tone === 'good' ? 'text-(--income)' : 'text-(--expense)'
}
</script>

<template>
  <article class="kpi-card">
    <p>{{ label }}</p>
    <strong :class="toneClass(tone)">{{ value }}</strong>
  </article>
</template>
