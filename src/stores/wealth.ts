import type { Month } from '../lib/month'
import { defineStore } from 'pinia'
import { computed } from 'vue'

import { useToast } from '../composables/useToast'
import type { SnapshotCommitEdit } from '../composables/useSnapshotEdit'
import { buildWealthViewModel } from '../domain/wealth/view-model'
import { formatMonthName } from '../lib/format'
import { syncSnapshotBalances } from '../lib/client/wealth-snapshot'
import { useFinancialStateStore } from './financial-state'
import { useUiStore } from './ui'

export const useWealthStore = defineStore('wealth', () => {
  const financialStateStore = useFinancialStateStore()
  const uiStore = useUiStore()
  const { showToast } = useToast()
  const ui = uiStore.ui

  const snapshotMonth = computed(() => ui.snapshotMonth)
  const viewModel = computed(() =>
    buildWealthViewModel(financialStateStore.state, ui.snapshotMonth),
  )

  function setMonth(month: Month): void {
    ui.snapshotMonth = month
  }

  function saveSnapshot(edits: SnapshotCommitEdit[]): void {
    const month = ui.snapshotMonth
    financialStateStore.commitState((draft) => {
      if (!draft.snapshots[String(month)]) {
        draft.snapshots[String(month)] = {
          month,
          accounts: {},
          investments: {},
          liabilities: {},
        }
      }
      const snapshot = draft.snapshots[String(month)]
      edits.forEach(({ kind, id, value }) => {
        if (value === null) {
          delete snapshot[kind][id]
        } else {
          snapshot[kind][id] = value
        }
      })
    })
    const snapshot = financialStateStore.state.snapshots[String(month)]
    const year = financialStateStore.year
    const currency = financialStateStore.state.currency
    void syncSnapshotBalances(year, snapshot, currency)
    showToast(`Snapshot de ${formatMonthName(month).toLowerCase()} guardado.`)
  }

  return {
    snapshotMonth,
    viewModel,
    setMonth,
    saveSnapshot,
  }
})
