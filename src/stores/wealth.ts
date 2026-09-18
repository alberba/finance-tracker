import { defineStore } from 'pinia'
import { computed } from 'vue'

import { useToast } from '../composables/useToast'
import { buildWealthViewModel } from '../domain/wealth/view-model'
import { resolveEntityId, syncUpsert } from '../lib/client/command-mapping'
import type { SnapshotKind, SnapshotRow } from '../scripts/types'
import { parseFloatSafe, round2 } from '../scripts/utils'
import { useFinancialStateStore } from './financial-state'
import { useUiStore } from './ui'

export interface SnapshotEdit {
  kind: SnapshotKind
  id: string
  value: string
}

const SNAPSHOT_KINDS: SnapshotKind[] = ['accounts', 'investments', 'liabilities']

interface SnapshotBalanceCommand {
  accountId: string
  balance: number
  currency: string
}

/**
 * Correlation id for one snapshot — its natural key, `(year, month)` (ADR
 * 0001); the string the sync path addresses it by. The month in the id is the
 * canonical 1-12 the command carries, and the year is what keeps March of two
 * different years from resolving to the same row (audit §4.6).
 */
function snapshotLocalId(year: number, monthIndex: number): string {
  return `${year}-${monthIndex + 1}`
}

/**
 * Resolves every account-kind entry of a snapshot to the server `account` id
 * it needs to travel with. A balance whose account hasn't synced yet is left
 * out (warned, not silently dropped) rather than sent with a bogus id — it
 * reappears on the next `saveSnapshot` once the account has caught up, the
 * same eventual-consistency gap `command-mapping.ts` documents for categories.
 */
async function buildSnapshotBalances(snapshot: SnapshotRow, currency: string): Promise<SnapshotBalanceCommand[]> {
  const balances: SnapshotBalanceCommand[] = []
  for (const kind of SNAPSHOT_KINDS) {
    for (const [id, value] of Object.entries(snapshot[kind])) {
      const accountId = await resolveEntityId('account', id)
      if (!accountId) {
        console.warn(
          `[sync-v2] No se pudo incluir el saldo de la cuenta local "${id}" en el snapshot: todavía no se ha sincronizado con el servidor.`,
        )
        continue
      }
      balances.push({ accountId, balance: value, currency })
    }
  }
  return balances
}

export const useWealthStore = defineStore('wealth', () => {
  const financialStateStore = useFinancialStateStore()
  const uiStore = useUiStore()
  const { showToast } = useToast()
  const ui = uiStore.ui

  const snapshotMonth = computed(() => ui.snapshotMonth)
  const viewModel = computed(() => buildWealthViewModel(financialStateStore.state, ui.snapshotMonth))

  function setMonth(month: number): void {
    ui.snapshotMonth = month
  }

  function saveSnapshot(edits: SnapshotEdit[]): void {
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
        const numeric = parseFloatSafe(value, NaN)
        if (Number.isNaN(numeric)) {
          delete snapshot[kind][id]
        } else {
          snapshot[kind][id] = round2(numeric)
        }
      })
    })
    const snapshot = financialStateStore.state.snapshots[String(month)]
    const year = financialStateStore.year
    const currency = financialStateStore.state.currency
    void buildSnapshotBalances(snapshot, currency).then((balances) =>
      syncUpsert('wealthSnapshot', snapshotLocalId(year, month), {
        snapshotDate: `${year}-${String(month + 1).padStart(2, '0')}-01`,
        year,
        month: month + 1,
        balances,
      }),
    )
    showToast('Snapshot guardado.')
  }

  return {
    snapshotMonth,
    viewModel,
    setMonth,
    saveSnapshot,
  }
})
