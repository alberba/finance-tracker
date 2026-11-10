import { storeToRefs } from 'pinia'
import { computed, ref } from 'vue'

import { buildWealthViewModel } from '../../../domain/wealth/view-model'
import { formatMonthName } from '../../../lib/format'
import type { SnapshotKind } from '../../../scripts/types'
import { useFinancialStateStore } from '../../../stores/financial-state'
import { useWealthStore } from '../../../stores/wealth'
import {
  balanceDate,
  closeCard,
  closeStatus,
  composition,
  coverMonth,
  evolution,
  holdings,
  monthTotals,
  type MonthTotals,
} from './view-model'
import { useNeonWealthScreens, type MonthsView } from './wealth-screens'

// What the cover of Patrimonio reads, shared by its two compositions (desktop
// and mobile): the month it talks about, its figures and the chosen chart,
// plus the account whose sheet is open.
export function useWealthCover() {
  const financialStateStore = useFinancialStateStore()
  const wealthStore = useWealthStore()
  const screens = useNeonWealthScreens()
  const { period, chartKind } = storeToRefs(screens)

  const month = computed(() => coverMonth(wealthStore.viewModel))
  // The shared view-model reads the rows at the month the snapshot editor is on;
  // the cover always reads them at its own month.
  const view = computed(() =>
    wealthStore.snapshotMonth === month.value
      ? wealthStore.viewModel
      : buildWealthViewModel(financialStateStore.state, month.value),
  )

  const monthLower = computed(() => formatMonthName(month.value).toLowerCase())
  const needsAccount = computed(() => view.value.groups.every((group) => group.rows.length === 0))
  const totals = computed<MonthTotals>(() => monthTotals(view.value, month.value))
  const status = computed(() => closeStatus(view.value, month.value))
  const card = computed(() => closeCard(view.value, month.value))
  const chart = computed(() => evolution(view.value, period.value, chartKind.value))
  const mix = computed(() => composition(view.value, month.value))
  const groups = computed(() => holdings(view.value, month.value))
  const date = computed(() => balanceDate(financialStateStore.year, month.value, new Date()))

  function openMonths(monthsView: MonthsView = 'close'): void {
    wealthStore.setMonth(month.value)
    screens.go('months', monthsView)
  }

  // The panel keeps the last account while it slides out.
  const openAccount = ref<{ kind: SnapshotKind; id: string } | null>(null)
  const shownAccount = ref<{ kind: SnapshotKind; id: string } | null>(null)
  const detailOpen = computed({
    get: () => openAccount.value !== null,
    set: (open) => {
      if (!open) openAccount.value = null
    },
  })

  function showAccount(kind: SnapshotKind, id: string): void {
    openAccount.value = shownAccount.value = { kind, id }
  }

  return {
    year: computed(() => financialStateStore.year),
    month,
    view,
    monthLower,
    needsAccount,
    totals,
    status,
    card,
    chart,
    mix,
    groups,
    date,
    period,
    chartKind,
    openMonths,
    shownAccount,
    detailOpen,
    showAccount,
  }
}
