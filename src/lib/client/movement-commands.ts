import type { Transaction } from '../../scripts/types'
import { useSyncStore } from '../../stores/sync'
import { resolveEntityId, resolveOrCreateCategoryId, syncListDiff } from './command-mapping'

/** Resolves movement references and enqueues the changes; server confirmation happens later. */
export async function syncMovements(
  before: readonly Transaction[],
  after: readonly Transaction[],
  currency: string,
): Promise<void> {
  await syncListDiff('transaction', before, after, (movement) =>
    buildMovementData(movement, currency),
  )
}

async function buildMovementData(movement: Transaction, currency: string) {
  if (movement.remoteOperation) {
    return { declared: Boolean(movement.declared), description: movement.description }
  }
  const accountId = await resolveEntityId('account', movement.accountId)
  if (!accountId) return null
  const categoryId = await resolveOrCreateCategoryId(movement.type, movement.category)
  const operation = await buildOperation(movement)
  return {
    accountId,
    categoryId,
    type: movement.type,
    date: movement.date,
    description: movement.description,
    amount: movement.amount,
    currency: movement.movementCurrency || currency,
    time: movement.time ?? null,
    declared: Boolean(movement.declared),
    ...(operation === undefined ? {} : { operation }),
  }
}

async function buildOperation(movement: Transaction) {
  if (movement.type !== 'investment') return null
  // Omission preserves the stored operation. Null is reserved for leaving investment.
  if (
    (movement.side !== 'buy' && movement.side !== 'sell') ||
    typeof movement.units !== 'number' ||
    !Number.isFinite(movement.units) ||
    typeof movement.unitPrice !== 'number' ||
    !Number.isFinite(movement.unitPrice)
  )
    return undefined
  const instrumentId = movement.instrumentId
    ? await useSyncStore().getInstrumentId(movement.instrumentId)
    : null
  return {
    symbol: movement.symbol ?? null,
    ...(instrumentId ? { instrumentId } : {}),
    side: movement.side,
    units: movement.units,
    unitPrice: movement.unitPrice,
    fee: Number(movement.fee) || 0,
  }
}
