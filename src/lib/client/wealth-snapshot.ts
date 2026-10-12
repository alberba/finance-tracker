import type { SnapshotKind, SnapshotRow } from '../../scripts/types'
import { resolveEntityId, syncWealthSnapshot } from './command-mapping'
import { isReadOnlyDemoActive } from './demo-source'

const SNAPSHOT_KINDS: SnapshotKind[] = ['accounts', 'investments', 'liabilities']

interface SnapshotBalanceCommand {
  accountId: string
  balance: number
  currency: string
}

/**
 * Resolves every account-kind entry of a snapshot to the server `account` id
 * it needs to travel with. A balance whose account hasn't synced yet is left
 * out (warned, not silently dropped) rather than sent with a bogus id — it
 * reappears on the next `saveSnapshot` once the account has caught up, the
 * same eventual-consistency gap `command-mapping.ts` documents for categories.
 */
async function buildSnapshotBalances(
  snapshot: SnapshotRow,
  currency: string,
): Promise<SnapshotBalanceCommand[]> {
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

export async function syncSnapshotBalances(
  year: number,
  snapshot: SnapshotRow,
  currency: string,
): Promise<void> {
  if (isReadOnlyDemoActive()) return
  const balances = await buildSnapshotBalances(snapshot, currency)
  await syncWealthSnapshot(year, snapshot.month + 1, balances)
}
