<script setup lang="ts">
import { storeToRefs } from 'pinia'
import { nextTick, watch } from 'vue'

import { useMediaQuery } from '../../../composables/useMediaQuery'
import { FRAME_QUERY } from '../../ui/sheet-drag'
import NeonWealthHome from './NeonWealthHome.vue'
import NeonWealthHomeMobile from './NeonWealthHomeMobile.vue'
import NeonWealthMonths from './NeonWealthMonths.vue'
import NeonWealthMonthsMobile from './NeonWealthMonthsMobile.vue'
import { useNeonWealthScreens } from './wealth-screens'

// Patrimonio in the new design (artboards «Patrimonio · 2560 px», #435, and
// «Patrimonio · móvil · Pixel 10», #436): the cover and «Balance por meses»,
// where a month is closed. Each screen brings its own header; this switches
// between them and moves focus to the new title so a keyboard or screen-reader
// user lands on it. The desktop frame and the mobile frame each get their own
// composition of the same data: it is the frame, not the container, that
// moves search and «Apuntar» out of the page, so its media query picks.
const props = withDefaults(defineProps<{ isActive?: boolean }>(), { isActive: false })

const { screen } = storeToRefs(useNeonWealthScreens())
const desktopFrame = useMediaQuery(FRAME_QUERY)

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
    <template v-if="desktopFrame">
      <NeonWealthHome v-if="screen === 'home'" />
      <NeonWealthMonths v-else />
    </template>
    <template v-else>
      <NeonWealthHomeMobile v-if="screen === 'home'" />
      <NeonWealthMonthsMobile v-else />
    </template>
  </section>
</template>
