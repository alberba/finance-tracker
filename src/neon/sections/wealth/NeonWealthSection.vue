<script setup lang="ts">
import { storeToRefs } from 'pinia'
import { nextTick, watch } from 'vue'

import NeonWealthHome from './NeonWealthHome.vue'
import NeonWealthMonths from './NeonWealthMonths.vue'
import { useNeonWealthScreens } from './wealth-screens'

// Patrimonio in the new design (artboard «Patrimonio · 2560 px», #435): the
// cover and «Balance por meses», where a month is closed. Each screen brings
// its own header; this switches between them and moves focus to the new title
// so a keyboard or screen-reader user lands on it.
const props = withDefaults(defineProps<{ isActive?: boolean }>(), { isActive: false })

const { screen } = storeToRefs(useNeonWealthScreens())

watch(screen, async () => {
  window.scrollTo?.({ top: 0 })
  await nextTick()
  if (props.isActive) document.getElementById('wealth-title')?.focus({ preventScroll: true })
})
</script>

<template>
  <section
    v-show="isActive"
    id="wealth"
    class="@container grid min-w-0 content-start gap-5"
    aria-labelledby="wealth-title"
  >
    <NeonWealthHome v-if="screen === 'home'" />
    <NeonWealthMonths v-else />
  </section>
</template>
