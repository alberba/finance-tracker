<script setup lang="ts">
import type { DiagnosticCode } from '../../../domain/reports/diagnostic'
import { buildWealthViewModel } from '../../../domain/wealth/view-model'
import { atMonth } from '../../../lib/month'
import { useFinancialStateStore } from '../../../stores/financial-state'
import { useUiStore } from '../../../stores/ui'
import { useWealthStore } from '../../../stores/wealth'
import { useScreenDiagnostic } from '../../reports/use-report-diagnostic'
import { coverMonth } from './view-model'
import { storeToRefs } from 'pinia'
import { nextTick, watch } from 'vue'

import { useMediaQuery } from '../../../composables/useMediaQuery'
import NeonBarTitle from '../../ui/NeonBarTitle.vue'
import { FRAME_QUERY } from '../../ui/sheet-drag'
import NeonWealthHome from './NeonWealthHome.vue'
import NeonWealthHomeMobile from './NeonWealthHomeMobile.vue'
import NeonWealthMonths from './NeonWealthMonths.vue'
import NeonWealthMonthsMobile from './NeonWealthMonthsMobile.vue'
import { useNeonWealthScreens } from './wealth-screens'

// Patrimonio (artboards «Patrimonio · 2560 px», #435, and
// «Patrimonio · móvil · Pixel 10», #436): the cover and «Balance por meses»,
// where a month is closed. Each screen brings its own header; this switches
// between them and moves focus to the new title so a keyboard or screen-reader
// user lands on it. The desktop frame and the mobile frame each get their own
// composition of the same data: it is the frame, not the container, that
// moves search and «Apuntar» out of the page, so its media query picks.
const props = withDefaults(defineProps<{ isActive?: boolean }>(), { isActive: false })

const screens = useNeonWealthScreens()
const { screen } = storeToRefs(screens)
const desktopFrame = useMediaQuery(FRAME_QUERY)
const wealth = useWealthStore()
const financial = useFinancialStateStore()
const ui = useUiStore().ui
useScreenDiagnostic('wealth', () => {
  const view = wealth.viewModel
  const home = screen.value === 'home'
  const month = home ? coverMonth(view) : ui.snapshotMonth
  const entry = atMonth(view.months, month)
  const period = month === ui.snapshotMonth ? view : buildWealthViewModel(financial.state, month)
  const groups =
    home && !desktopFrame.value && screens.tab === 'accounts'
      ? period.groups.filter((group) => screens.filter === 'all' || group.kind === screens.filter)
      : period.groups
  const rows = groups.flatMap((group) => group.rows)
  const checks: DiagnosticCode[] = []
  if (rows.some((row) => row.snapshot !== null)) checks.push('wealth-snapshot')
  if (!entry.saved) checks.push('wealth-no-snapshot')
  if (entry.available && rows.some((row) => row.snapshot === null)) checks.push('wealth-calculated')
  if (!rows.length || !checks.length) checks.push('insufficient')
  return {
    subview: home
      ? desktopFrame.value
        ? 'home'
        : screens.tab
      : desktopFrame.value
        ? 'months'
        : screens.monthsView,
    year: financial.year,
    month,
    options: home ? [screens.range, ...(desktopFrame.value ? [] : [screens.filter])] : [],
    checks,
  }
})

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
    class="@container relative grid min-w-0 content-start gap-5"
    aria-labelledby="wealth-title"
  >
    <template v-if="desktopFrame">
      <NeonWealthHome v-if="screen === 'home'" />
      <NeonWealthMonths v-else />
    </template>
    <template v-else>
      <NeonBarTitle v-if="isActive && screen === 'home'" title="Patrimonio" />
      <NeonWealthHomeMobile v-if="screen === 'home'" />
      <NeonWealthMonthsMobile v-else />
    </template>
  </section>
</template>
