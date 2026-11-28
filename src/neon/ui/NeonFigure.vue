<script setup lang="ts">
import { computed } from 'vue'

import { splitDecimals } from '../../lib/format'

// A big figure (DESIGN.md, Números): the cents and the currency drop to 0.42em
// in the muted color. The size comes from the caller's class.
const props = defineProps<{ value: string }>()
const parts = computed(() => splitDecimals(props.value))
</script>

<template>
  <span class="font-display whitespace-nowrap tabular-nums"
    >{{ parts.whole
    }}<span v-if="parts.rest" class="text-muted text-[0.42em] tracking-[-0.02em]">{{
      parts.rest
    }}</span></span
  >
</template>
