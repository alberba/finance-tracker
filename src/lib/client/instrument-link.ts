/**
 * Instrument link execution (#489).
 *
 * The caller (the market store) no longer orchestrates the
 * configuration → sync → catalog gate → movement sequence: it captures the
 * user's action, the target ids and the optimistic state, and this module
 * hides the rest. The link:
 *
 * 1. fixes the targets at click time, so movements created afterwards are
 *    never added;
 * 2. saves the private quote configuration and waits for its catalog
 *    reference;
 * 3. publishes each target from the movement's **current** state (latest
 *    amount, description, whole investment operation, saving destination,
 *    month, time and declared flag), guarded by the persisted generation;
 * 4. on a stale generation, re-reads the movement instead of replaying the
 *    snapshot it started with, and discards deleted, incompatible or
 *    explicitly relinked/unlinked targets.
 *
 * Resuming an unresolved link after a reload is #490/#491: this module keeps
 * its target set in memory only.
 */

import { unlinkedMovementIdsForInstrument } from '../../domain/investment/symbol-matching'
import type { Instrument, Transaction } from '../../scripts/types'
import { useFinancialStateStore } from '../../stores/financial-state'
import { useSyncStore } from '../../stores/sync'
import { isReadOnlyDemoActive } from './demo-source'
import { forgetLinkTargets, rememberLinkTargets } from './link-targets'
import { buildMovementData, movementFingerprint } from './movement-commands'
import { movementPublicationWriterId, type MovementPublicationRecord } from './movement-publication'

export interface InstrumentLinkRequest {
  instrumentId: string
  /** Persists the private quote configuration; resolves once the command is queued. */
  saveConfiguration: (instrument: Instrument) => Promise<boolean>
  onError: (message: string) => void
}

/**
 * Runs the user's "Vincular movimientos" action. Returns the number of
 * movements that matched at click time (the optimistic state, which the
 * existing UI renders immediately); the asynchronous publication continues in
 * the background and reports failures through `onError`.
 */
export function linkInstrumentMovements(request: InstrumentLinkRequest): number {
  if (isReadOnlyDemoActive()) return 0
  const financialStore = useFinancialStateStore()
  const syncStore = useSyncStore()
  const instrument = financialStore.instruments.find((item) => item.id === request.instrumentId)
  if (!instrument) return 0
  const assetName = financialStore.investmentAssets.find(
    (asset) => asset.id === instrument.investmentAssetId,
  )?.name
  const targetIds = unlinkedMovementIdsForInstrument(
    financialStore.transactions,
    instrument,
    assetName,
  )
  if (targetIds.length === 0) return 0

  financialStore.commitState((draft) => {
    const draftInstrument = draft.instruments.find((item) => item.id === instrument.id)
    for (const id of targetIds) {
      const transaction = draft.transactions.find((item) => item.id === id)
      if (transaction) transaction.instrumentId = instrument.id
    }
    if (draftInstrument) {
      // Vincular movimientos hace que sean la fuente inicial de la tenencia.
      // Esto también corrige instrumentos creados por versiones anteriores que
      // guardaban un snapshot provisional de cero al configurarlos.
      delete draftInstrument.holdingUnits
      delete draftInstrument.holdingsAsOf
      delete draftInstrument.holdingsUpdatedAt
      delete draftInstrument.holdingsSource
    }
  })

  const updated = financialStore.instruments.find((item) => item.id === instrument.id)
  if (!updated) return 0
  rememberLinkTargets(targetIds, instrument.id)
  const ownerId = syncStore.userId
  if (!ownerId) {
    // No authenticated sync this page (unit/demo fixtures): the optimistic
    // link is all there is, exactly as before.
    forgetLinkTargets(targetIds)
    return targetIds.length
  }

  void executeInstrumentLink({
    instrumentId: instrument.id,
    instrument: { ...updated },
    targetIds,
    ownerId,
    saveConfiguration: request.saveConfiguration,
    onError: request.onError,
  })
  return targetIds.length
}

interface InstrumentLinkExecution extends InstrumentLinkRequest {
  instrument: Instrument
  targetIds: string[]
  ownerId: string
}

async function executeInstrumentLink(execution: InstrumentLinkExecution): Promise<void> {
  const syncStore = useSyncStore()
  const stillOwner = () => syncStore.userId === execution.ownerId && !isReadOnlyDemoActive()

  try {
    if (!(await execution.saveConfiguration(execution.instrument))) {
      throw new Error('No se pudo guardar la cotización.')
    }
    if (!stillOwner()) return
    // A newly configured symbol gets its catalog id on the server. Confirm
    // that write before resolving the movement's operation.
    await syncStore.syncNow()
    if (!stillOwner()) return
    let catalogId = await syncStore.getInstrumentId(execution.instrument.id)
    if (!catalogId) {
      await syncStore.syncNow()
      if (!stillOwner()) return
      catalogId = await syncStore.getInstrumentId(execution.instrument.id)
    }
    if (!catalogId) {
      throw new Error('Sincroniza la cotización antes de vincular movimientos.')
    }
    for (const movementId of execution.targetIds) {
      if (!stillOwner()) return
      await publishLinkedTarget(execution.instrument, movementId)
    }
  } catch (error) {
    execution.onError(error instanceof Error ? error.message : String(error))
  } finally {
    forgetLinkTargets(execution.targetIds)
  }
}

async function publishLinkedTarget(instrument: Instrument, movementId: string): Promise<void> {
  const financialStore = useFinancialStateStore()
  const syncStore = useSyncStore()
  const writerId = movementPublicationWriterId()
  let attempts = 0
  let refreshed = false
  while (attempts < 3) {
    attempts += 1
    const movement = financialStore.transactions.find((item) => item.id === movementId)
    if (!movement || movement.type !== 'investment') return

    const record = (await syncStore.readMovementPublications([movementId])).get(movementId)
    if (!isCompatible(record, instrument.id)) return
    if (movement.instrumentId && movement.instrumentId !== instrument.id) return

    // The pull that confirms the configuration rebuilds the state from the
    // server, where this not-yet-published link is absent. Re-apply the
    // link's own intent; a later explicit unlink is already an incompatible
    // record and was rejected above.
    if (!movement.instrumentId) {
      financialStore.commitState((draft) => {
        const transaction = draft.transactions.find((item) => item.id === movementId)
        if (transaction) transaction.instrumentId = instrument.id
      })
    }
    const live = financialStore.transactions.find((item) => item.id === movementId)
    if (!live || live.type !== 'investment') return
    const fingerprint = movementFingerprint(live)

    if (
      !refreshed &&
      record &&
      record.writerId !== writerId &&
      record.fingerprint !== fingerprint
    ) {
      // Another tab published a state this tab has not seen. Flush and pull
      // before rebuilding, so the command carries the current state instead of
      // overwriting it. Offline that read cannot be trusted: leave the target
      // unlinked for a later retry rather than publish a stale command.
      refreshed = true
      await syncStore.syncNow()
      if (syncStore.connection === 'offline') return
      continue
    }

    const data = await buildMovementData(live, financialStore.currency)
    if (!data) return
    const ref = await syncStore.getEntityRef('transaction', movementId)
    const [result] = await syncStore.publishMovementCommands([
      {
        movementId,
        plan: {
          action: 'update',
          patch: data,
          ...(ref ? { ref: { entityId: ref.entityId, baseVersion: ref.version } } : {}),
        },
        origin: 'instrumentLink',
        type: live.type,
        instrumentId: instrument.id,
        fingerprint,
        expectedGeneration: record?.generation ?? 0,
        link: { instrumentId: instrument.id },
      },
    ])
    if (!result) return
    if (result.outcome === 'published') return
    if (result.outcome === 'unresolved') return
    // Stale: the persisted generation moved after this attempt was built.
    if (!isCompatible(result.record, instrument.id)) return
    if (result.record?.writerId === writerId) {
      // Our own tab's edit: the live state is the current one.
      continue
    }
    if (refreshed) return
    refreshed = true
    await syncStore.syncNow()
    if (syncStore.connection === 'offline') return
  }
}

/**
 * A record that makes the link's old continuation lose: a deleted movement,
 * a type that is no longer investment, or an explicit later link/unlink.
 */
function isCompatible(
  record: MovementPublicationRecord | undefined,
  instrumentId: string,
): boolean {
  if (!record) return true
  if (record.status === 'deleted') return false
  if (record.type !== 'investment') return false
  if (record.unlinked) return false
  if (record.instrumentId !== null && record.instrumentId !== instrumentId) return false
  return true
}

export interface LinkedMovementConflict {
  movementId: string
  instrumentId: string
  generation: number
}

/**
 * Re-evaluates a link-owned command the server rejected with a conflict,
 * after the sync store pulled the server's current rows. It rebuilds the
 * command from the movement's current state (with a fresh command identity,
 * minted by the publication transaction) and never retries the old payload.
 */
export async function recoverLinkedMovement(conflict: LinkedMovementConflict): Promise<boolean> {
  if (isReadOnlyDemoActive()) return false
  const financialStore = useFinancialStateStore()
  const syncStore = useSyncStore()
  const record = (await syncStore.readMovementPublications([conflict.movementId])).get(
    conflict.movementId,
  )
  if (!isCompatible(record, conflict.instrumentId)) return false
  const movement = financialStore.transactions.find(
    (item): item is Transaction => item.id === conflict.movementId,
  )
  if (!movement || movement.type !== 'investment') return false
  if (!movement.instrumentId) {
    financialStore.commitState((draft) => {
      const transaction = draft.transactions.find((item) => item.id === conflict.movementId)
      if (transaction) transaction.instrumentId = conflict.instrumentId
    })
  }
  const live = financialStore.transactions.find((item) => item.id === conflict.movementId)
  if (!live || live.type !== 'investment') return false
  if (live.instrumentId && live.instrumentId !== conflict.instrumentId) return false
  const data = await buildMovementData(live, financialStore.currency)
  if (!data) return false
  const ref = await syncStore.getEntityRef('transaction', conflict.movementId)
  const [result] = await syncStore.publishMovementCommands([
    {
      movementId: conflict.movementId,
      plan: {
        action: 'update',
        patch: data,
        ...(ref ? { ref: { entityId: ref.entityId, baseVersion: ref.version } } : {}),
      },
      origin: 'instrumentLink',
      type: live.type,
      instrumentId: conflict.instrumentId,
      fingerprint: movementFingerprint(live),
      expectedGeneration: record?.generation ?? 0,
      link: { instrumentId: conflict.instrumentId },
    },
  ])
  // A stale outcome means another publication superseded this re-evaluation;
  // never overwrite it with the payload built here.
  return result?.outcome === 'published'
}
