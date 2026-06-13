<script setup lang="ts">
defineProps<{
  label: string
  value: string
  tone?: 'good' | 'bad'
}>()
</script>

<template>
  <article class="kpi-card">
    <p>{{ label }}</p>
    <strong :class="tone ? `text-${tone}` : ''">{{ value }}</strong>
  </article>
</template>
