<script setup lang="ts">
defineProps<{ symbol: string }>()
</script>

<template>
  <a
    v-if="symbol.trim()"
    :href="`https://finance.yahoo.com/quote/${encodeURIComponent(symbol.trim())}/`"
    target="_blank"
    rel="noopener noreferrer"
    :aria-label="`Ver ${symbol} en Yahoo Finance (nueva pestaña)`"
    class="text-primary inline-flex min-h-11 items-center gap-1 rounded-sm text-sm font-semibold underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2 active:opacity-70"
  >
    Ver en Yahoo <span aria-hidden="true">↗</span>
  </a>
</template>
