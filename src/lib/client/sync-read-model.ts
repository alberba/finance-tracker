import type { SyncEntityType } from '../server/sync/command-schemas'
import type { CachedEntity } from './idb-cache'
import type { SyncV2Bootstrap } from './v2-state-projection'

export const SYNC_COLLECTIONS = {
  account: 'accounts',
  category: 'categories',
  transaction: 'transactions',
  subscription: 'subscriptions',
  recurringRule: 'recurringRules',
  pendingMovement: 'pendingMovements',
  budgetEntry: 'budgetEntries',
  goal: 'goals',
  contribution: 'contributions',
  userInstrument: 'userInstruments',
  wealthSnapshot: 'wealthSnapshots',
  stockeventsMapping: 'stockeventsSymbolMappings',
  stockeventsCashEntry: 'stockeventsCashSyncEntries',
} as const satisfies Record<SyncEntityType, keyof SyncV2Bootstrap>

export interface RemoteChange {
  revision?: number
  entityType: string
  entityId: string
  changeType: string
  payload: string | null
}

export function emptyReadModel(): SyncV2Bootstrap {
  return {
    revision: 0,
    settings: null,
    accounts: [],
    categories: [],
    transactions: [],
    subscriptions: [],
    recurringRules: [],
    pendingMovements: [],
    budgetEntries: [],
    goals: [],
    contributions: [],
    userInstruments: [],
    wealthSnapshots: [],
  }
}

/** Advances the projection only after every change can be represented. */
export function applyRemoteChanges(
  model: SyncV2Bootstrap,
  changes: RemoteChange[],
  revision: number,
): SyncV2Bootstrap {
  let next = { ...model }
  for (const change of changes) {
    if (change.entityType === 'userSettings') {
      const settings = JSON.parse(change.payload ?? 'null')
      if (!settings || typeof settings !== 'object') throw new Error('Ajustes remotos inválidos.')
      next = {
        ...next,
        settings,
        twrLiquidityAccounts: settings.twrLiquidityAccounts ?? next.twrLiquidityAccounts,
        stockeventsCashMappings: settings.stockeventsCashMappings ?? next.stockeventsCashMappings,
      }
      continue
    }
    if (!(change.entityType in SYNC_COLLECTIONS)) {
      throw new Error('El cambio remoto requiere volver a cargar los datos.')
    }
    const key = SYNC_COLLECTIONS[change.entityType as SyncEntityType]
    const rows: CachedEntity[] = (next[key] ?? []).slice()
    const index = rows.findIndex((row) => row.id === change.entityId)
    if (change.changeType === 'remove') {
      if (index >= 0) rows.splice(index, 1)
    } else {
      const row = JSON.parse(change.payload ?? 'null') as CachedEntity | null
      if (!row || row.id !== change.entityId) throw new Error('Entidad remota inválida.')
      if (index < 0) rows.push(row)
      else if (Number(row.version ?? 0) >= Number(rows[index].version ?? 0)) rows[index] = row
    }
    next = { ...next, [key]: rows }
  }
  return { ...next, revision }
}
