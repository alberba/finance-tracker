import { storeToRefs } from 'pinia'
import { computed } from 'vue'

import { useSnapshotEdit } from '../../../composables/useSnapshotEdit'
import { useToast } from '../../../composables/useToast'
import { formatMonthName } from '../../../lib/format'
import type { Month } from '../../../lib/month'
import { useFinancialStateStore } from '../../../stores/financial-state'
import { useWealthStore } from '../../../stores/wealth'
import { closeAction, closeStatus, closingEdits, ledgerGroups, monthTable } from './view-model'

// «Balance por meses»: close a month by writing down the real balance of each
// account (an empty field keeps the calculated one). Shared by the desktop and
// the mobile composition, which only differ in how they lay the form out.
export function useMonthClose() {
  const financialStateStore = useFinancialStateStore()
  const wealthStore = useWealthStore()
  const { viewModel, snapshotMonth } = storeToRefs(wealthStore)
  const { showToast } = useToast()

  const edit = useSnapshotEdit({
    groups: computed(() => viewModel.value.groups),
    context: computed(() => `${financialStateStore.year}:${snapshotMonth.value}`),
    commit: () => undefined,
  })
  const { totals, changes, valid } = edit

  const monthName = computed(() => formatMonthName(snapshotMonth.value))
  const monthLower = computed(() => monthName.value.toLowerCase())
  const previousName = computed(() => {
    const index = viewModel.value.history.months.indexOf(snapshotMonth.value)
    return index > 0 ? formatMonthName(viewModel.value.history.months[index - 1]) : '—'
  })
  const status = computed(() => closeStatus(viewModel.value, snapshotMonth.value))
  const groups = computed(() => ledgerGroups(viewModel.value, snapshotMonth.value))
  const action = computed(() =>
    closeAction({
      month: snapshotMonth.value,
      closed: status.value.closed,
      changes: changes.value,
      invalid: !valid.value,
    }),
  )
  const table = computed(() => monthTable(viewModel.value))

  function close(): void {
    if (action.value.locked) return
    const edits = closingEdits(viewModel.value.groups, edit.field)
    if (!edits) return
    const wasClosed = status.value.closed
    wealthStore.saveSnapshot(edits, { notify: false })
    edit.discard()
    showToast(
      wasClosed ? `Cambios de ${monthLower.value} guardados.` : `${monthName.value} cerrado.`,
    )
  }

  function pick(month: Month): void {
    wealthStore.setMonth(month)
  }

  return {
    year: computed(() => financialStateStore.year),
    viewModel,
    snapshotMonth,
    edit,
    totals,
    changes,
    valid,
    monthName,
    monthLower,
    previousName,
    status,
    groups,
    action,
    table,
    close,
    pick,
  }
}
