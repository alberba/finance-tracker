import type { Transaction } from '../../scripts/types'
import { monthFromISO } from '../../scripts/utils'
import { useFinancialStateStore } from '../../stores/financial-state'
import { useSyncStore } from '../../stores/sync'
import { isReadOnlyDemoActive } from './demo-source'
import { linkTargetFor } from './link-targets'
import { resolveEntityId, resolveOrCreateCategoryId } from './command-mapping'
import type { MovementCommandPlan, MovementPublicationInput } from './movement-publication'

/**
 * Publishes movement changes through the persisted publication discipline
 * (#489): every command is built from the movement's **current** state and
 * written atomically with its generation, in the same IndexedDB transaction.
 * All movement writers (Movimientos, Inversión, recurring confirmations and
 * the instrument link) go through here, so none of them can bypass the
 * discipline by holding a stale before/after snapshot.
 *
 * Returns `false` when a required reference cannot be resolved or the queue
 * rejects a command, mirroring the previous `syncListDiff` contract.
 */
export async function syncMovements(
  before: readonly Transaction[],
  after: readonly Transaction[],
  currency: string,
): Promise<boolean | void> {
  if (isReadOnlyDemoActive()) return
  const syncStore = useSyncStore()
  const publications = await buildMovementPublications(before, after, currency)
  if (publications === null) return false
  if (publications.length === 0) return true
  const results = await syncStore.publishMovementCommands(publications)
  return results.every((result) => result.outcome !== 'unresolved')
}

/**
 * The ids a write actually changed, re-read against the live state: a
 * movement deleted while another command was being built is published as a
 * removal instead of being recreated from an old array.
 */
export async function buildMovementPublications(
  before: readonly Transaction[],
  after: readonly Transaction[],
  currency: string,
): Promise<MovementPublicationInput[] | null> {
  const syncStore = useSyncStore()
  const beforeById = new Map(before.map((movement) => [movement.id, movement]))
  const afterById = new Map(after.map((movement) => [movement.id, movement]))
  const publications: MovementPublicationInput[] = []

  for (const [id, previous] of beforeById) {
    if (afterById.has(id)) continue
    const live = liveMovement(id)
    if (live) continue
    publications.push(await publicationForRemoval(syncStore, id, previous))
  }

  for (const item of after) {
    const previous = beforeById.get(item.id)
    // Re-read on every step: another command may have edited or deleted the
    // movement while this one was resolving references.
    const live = liveMovement(item.id)
    if (!live) {
      // Deleted after this snapshot was taken. Cancelling a still-queued
      // create (or publishing the removal) keeps a link continuation from
      // resurrecting it.
      publications.push(await publicationForRemoval(syncStore, item.id, previous ?? item))
      continue
    }
    if (previous && JSON.stringify(previous) === JSON.stringify(live)) continue
    const data = await buildMovementData(live, currency)
    if (data === null) return null
    const ref = await syncStore.getEntityRef('transaction', live.id)
    let plan: MovementCommandPlan
    if (previous || ref) {
      // The movement already exists on this device or the server; fold into a
      // still-queued create when there is no confirmed row yet.
      plan = {
        action: 'update',
        patch: data,
        ...(ref ? { ref: { entityId: ref.entityId, baseVersion: ref.version } } : {}),
      }
    } else {
      const pendingId = await syncStore.peekPendingCreateId(
        'transaction',
        (entity) => entity.id === live.id,
      )
      plan = pendingId
        ? { action: 'update', patch: data }
        : { action: 'create', data: { ...data, id: live.id } }
    }
    const linkTarget = linkTargetFor(syncStore.userId ?? '', live.id)
    publications.push({
      movementId: live.id,
      plan,
      origin: 'movement',
      type: live.type,
      instrumentId: live.instrumentId ?? null,
      fingerprint: movementFingerprint(live),
      // A link set this movement to its instrument; publishing it without
      // that instrument now is the user's later explicit unlink.
      ...(linkTarget !== undefined && live.instrumentId !== linkTarget ? { unlinked: true } : {}),
    })
  }

  return publications
}

function liveMovement(id: string): Transaction | undefined {
  return useFinancialStateStore().transactions.find((movement) => movement.id === id)
}

async function publicationForRemoval(
  syncStore: ReturnType<typeof useSyncStore>,
  id: string,
  lastKnown: Transaction,
): Promise<MovementPublicationInput> {
  const ref = await syncStore.getEntityRef('transaction', id)
  return {
    movementId: id,
    plan: {
      action: 'remove',
      ...(ref ? { ref: { entityId: ref.entityId, baseVersion: ref.version } } : {}),
    },
    origin: 'movement',
    type: lastKnown.type,
    instrumentId: lastKnown.instrumentId ?? null,
    fingerprint: '',
  }
}

/** Builds the command payload for one movement from its current state. */
export async function buildMovementData(
  movement: Transaction,
  currency: string,
): Promise<Record<string, unknown> | null> {
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
    accountingMonth: movement.month === monthFromISO(movement.date) ? null : movement.month,
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

/**
 * The movement state a publication is built from, as a compact fingerprint.
 * It identifies whether a tab that lost the generation race already sees the
 * other tab's write; it is not a snapshot that could be replayed.
 */
export function movementFingerprint(movement: Transaction): string {
  return JSON.stringify([
    movement.type,
    movement.date,
    movement.month,
    movement.accountId,
    movement.destinationAccountId ?? null,
    movement.category,
    movement.description,
    movement.amount,
    movement.movementCurrency ?? null,
    movement.time ?? null,
    Boolean(movement.declared),
    movement.side ?? null,
    movement.symbol ?? null,
    movement.instrumentId ?? null,
    movement.units ?? null,
    movement.unitPrice ?? null,
    movement.fee ?? null,
  ])
}
