import type { Transaction } from '../../scripts/types'
import { monthFromISO } from '../../scripts/utils'
import { useSyncStore } from '../../stores/sync'
import { resolveEntityId, resolveOrCreateCategoryId, syncListDiff } from './command-mapping'

/** Resolves movement references and enqueues the changes; server confirmation happens later. */
export async function syncMovements(
  before: readonly Transaction[],
  after: readonly Transaction[],
  currency: string,
): Promise<boolean | void> {
  return syncListDiff('transaction', before, after, (movement) =>
    buildMovementData(movement, currency),
  )
}

async function buildMovementData(movement: Transaction, currency: string) {
  if (movement.remoteOperation) {
    return { declared: Boolean(movement.declared), description: movement.description }
  }
  const accountId = await resolveEntityId('account', movement.accountId)
  if (!accountId) return null
  // A saving is meaningless without a resolvable destination: skip until it resolves.
  const destinationAccountId =
    movement.type === 'saving' && movement.destinationAccountId
      ? await resolveEntityId('account', movement.destinationAccountId)
      : null
  if (movement.type === 'saving' && !destinationAccountId) return null
  const categoryId = await resolveOrCreateCategoryId(movement.type, movement.category)
  if (movement.category && !categoryId) return null
  const operation = await buildOperation(movement)
  return {
    accountId,
    // Explicit null clears the destination when a saving becomes another type.
    destinationAccountId,
    categoryId,
    type: movement.type,
    date: movement.date,
    description: movement.description,
    amount: movement.amount,
    currency: movement.movementCurrency || currency,
    time: movement.time ?? null,
    declared: Boolean(movement.declared),
    // Only a month other than the date's is stored; otherwise it follows the date.
    accountingMonth:
      movement.month === monthFromISO(movement.date) ? null : movement.month,
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
