<script setup lang="ts">
import type { WidgetId } from './widgets'

// A drawing of what each widget looks like, for the catalog: its shape, not
// its data. Strokes and fills use the current text color, so it follows the
// theme.
defineProps<{ id: WidgetId }>()
</script>

<template>
  <svg viewBox="0 0 160 96" fill="none" aria-hidden="true">
    <template v-if="id === 'wealth' || id === 'investments'">
      <rect x="6" y="8" width="52" height="8" rx="4" fill="currentColor" opacity="0.5" />
      <rect x="6" y="22" width="30" height="5" rx="2.5" fill="currentColor" opacity="0.25" />
      <path
        d="M6 84 32 70 56 74 82 52 108 56 134 30 154 22 154 90 6 90Z"
        fill="currentColor"
        opacity="0.14"
      />
      <path
        d="M6 84 32 70 56 74 82 52 108 56 134 30 154 22"
        stroke="currentColor"
        stroke-width="2.5"
        stroke-linecap="round"
        stroke-linejoin="round"
        opacity="0.8"
      />
    </template>
    <template v-else-if="id === 'month'">
      <rect x="6" y="8" width="78" height="20" rx="6" fill="currentColor" opacity="0.5" />
      <rect x="6" y="36" width="148" height="5" rx="2.5" fill="currentColor" opacity="0.25" />
      <template v-for="row in 3" :key="row">
        <rect
          x="6"
          :y="44 + row * 14"
          width="10"
          height="8"
          rx="2"
          fill="currentColor"
          opacity="0.3"
        />
        <rect
          x="22"
          :y="44 + row * 14"
          width="44"
          height="8"
          rx="4"
          fill="currentColor"
          opacity="0.4"
        />
        <rect
          x="118"
          :y="44 + row * 14"
          width="36"
          height="8"
          rx="4"
          fill="currentColor"
          opacity="0.4"
        />
      </template>
    </template>
    <template v-else-if="id === 'recent' || id === 'pending'">
      <template v-for="row in 4" :key="row">
        <circle cx="14" :cy="row * 22 - 4" r="8" fill="currentColor" opacity="0.28" />
        <rect
          x="30"
          :y="row * 22 - 12"
          width="64"
          height="7"
          rx="3.5"
          fill="currentColor"
          opacity="0.5"
        />
        <rect
          x="30"
          :y="row * 22 - 1"
          width="40"
          height="5"
          rx="2.5"
          fill="currentColor"
          opacity="0.25"
        />
        <rect
          x="120"
          :y="row * 22 - 10"
          width="34"
          height="7"
          rx="3.5"
          fill="currentColor"
          opacity="0.4"
        />
      </template>
    </template>
    <template v-else>
      <template v-for="row in 3" :key="row">
        <rect
          x="6"
          :y="row * 28 - 20"
          width="50"
          height="7"
          rx="3.5"
          fill="currentColor"
          opacity="0.5"
        />
        <rect
          x="116"
          :y="row * 28 - 20"
          width="38"
          height="7"
          rx="3.5"
          fill="currentColor"
          opacity="0.4"
        />
        <rect
          x="6"
          :y="row * 28 - 6"
          width="148"
          height="6"
          rx="3"
          fill="currentColor"
          opacity="0.15"
        />
        <rect
          x="6"
          :y="row * 28 - 6"
          :width="148 - row * 36"
          height="6"
          rx="3"
          fill="currentColor"
          opacity="0.45"
        />
      </template>
    </template>
  </svg>
</template>
