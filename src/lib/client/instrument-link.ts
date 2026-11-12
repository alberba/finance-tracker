/**
 * Durable instrument link (#489/#490).
 *
 * The caller expresses one intention — "link these movements to this
 * instrument" — and this module owns the rest: persisting the fixed targets
 * before reporting acceptance, saving the private quote configuration, waiting
 * for the catalog reference, publishing each movement from its **current**
 * state with the persisted generation, and resuming after a reload or a
 * reconnection.
 *
 * Acceptance is durable: the optimistic projection the UI shows immediately is
 * labelled `local-saved`/`sending`, never "confirmed". Confirmation is only the
 * server's acknowledgement, absorbed into the cache before the queue retires
 * the command.
 *
 * The new-instrument configuration gate still belongs to the caller until
 * #491; this module keeps it and stores the intent around it so a reload in
 * between does not lose the selection.
 */

import { unlinkedMovementIdsForInstrument } from '../../domain/investment/symbol-matching'
import type { Instrument, Transaction } from '../../scripts/types'
import { useFinancialStateStore } from '../../stores/financial-state'
import { useSyncStore } from '../../stores/sync'
import { isReadOnlyDemoActive } from './demo-source'
import { isUnresolvedIntent, type DurableIntentView } from './durable-intents'
import { forgetLinkTargets, rememberLinkTargets } from './link-targets'
import { buildMovementData, movementFingerprint } from './movement-commands'
import {
  movementPublicationWriterId,
  type MovementPublicationInput,
  type MovementPublicationRecord,
} from './movement-publication'

export interface InstrumentLinkRequest {
  instrumentId: string
  /** Persists the private quote configuration; resolves once the command is queued. */
  saveConfiguration: (instrument: Instrument) => Promise<boolean>
  onError: (message: string) => void
}

export interface InstrumentLinkAcceptance {
  /** Movements fixed at click time (the optimistic projection the UI shows). */
  targets: number
  /** True once the intent and its fixed ids are durable in this browser. */
  accepted: boolean
}

const CATALOG_ERROR = 'Sincroniza la cotización antes de vincular movimientos.'
const CONFIGURATION_ERROR = 'No se pudo guardar la cotización.'

/**
 * Runs the user's "Vincular movimientos" action. Resolves once the intent and
 * its fixed targets are persisted; the publication continues in the
 * background and reports failures through the intent record and `onError`.
 */
export async function linkInstrumentMovements(
  request: InstrumentLinkRequest,
): Promise<InstrumentLinkAcceptance> {
  if (isReadOnlyDemoActive()) return { targets: 0, accepted: false }
  const financialStore = useFinancialStateStore()
  const syncStore = useSyncStore()
  const instrument = financialStore.instruments.find((item) => item.id === request.instrumentId)
  if (!instrument) return { targets: 0, accepted: false }
  const assetName = financialStore.investmentAssets.find(
    (asset) => asset.id === instrument.investmentAssetId,
  )?.name
  const targetIds = unlinkedMovementIdsForInstrument(
    financialStore.transactions,
    instrument,
    assetName,
  )
  if (targetIds.length === 0) return { targets: 0, accepted: false }

  const ownerId = syncStore.userId
  if (!ownerId) {
    // No authenticated sync this page (unit/demo fixtures): the optimistic
    // link is all there is, exactly as before.
    applyOptimisticLink(instrument.id, targetIds)
    return { targets: targetIds.length, accepted: false }
  }

  // Durable acceptance comes first: nothing is reported or projected as
  // accepted until the intent and its original ids are in IndexedDB.
  const accepted = await syncStore.acceptIntent({
    kind: 'instrumentLink',
    ownerUserId: ownerId,
    targetIds,
    payload: {
      instrumentId: instrument.id,
      ...(assetName ? { assetName } : {}),
    },
  })
  if (!accepted) return { targets: targetIds.length, accepted: false }

  applyOptimisticLink(instrument.id, targetIds)
  const updated = financialStore.instruments.find((item) => item.id === instrument.id)
  if (!updated) return { targets: targetIds.length, accepted: true }
  rememberLinkTargets(targetIds, instrument.id)
  void executeInstrumentLink({
    intentId: accepted.intent.id,
    ownerId,
    instrument: { ...updated },
    targetIds,
    saveConfiguration: request.saveConfiguration,
    onError: request.onError,
  })
  return { targets: targetIds.length, accepted: true }
}

function applyOptimisticLink(instrumentId: string, targetIds: readonly string[]): void {
  const financialStore = useFinancialStateStore()
  financialStore.commitState((draft) => {
    const draftInstrument = draft.instruments.find((item) => item.id === instrumentId)
    for (const id of targetIds) {
      const transaction = draft.transactions.find((item) => item.id === id)
      if (transaction) transaction.instrumentId = instrumentId
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
}

interface InstrumentLinkExecution {
  intentId: string
  ownerId: string
  instrument: Instrument
  targetIds: string[]
  saveConfiguration: InstrumentLinkRequest['saveConfiguration']
  onError: InstrumentLinkRequest['onError']
}

async function executeInstrumentLink(execution: InstrumentLinkExecution): Promise<void> {
  const syncStore = useSyncStore()
  const stillOwner = () => syncStore.userId === execution.ownerId && !isReadOnlyDemoActive()

  try {
    if (!(await execution.saveConfiguration(execution.instrument))) {
      throw new Error(CONFIGURATION_ERROR)
    }
    if (!stillOwner()) return
    // A newly configured symbol gets its catalog id on the server. Confirm
    // that write before resolving the movement's operation (#491 will move
    // this dependency into the intent record).
    await syncStore.syncNow()
    if (!stillOwner()) return
    let catalogId = await syncStore.getInstrumentId(execution.instrument.id)
    if (!catalogId) {
      await syncStore.syncNow()
      if (!stillOwner()) return
      catalogId = await syncStore.getInstrumentId(execution.instrument.id)
    }
    if (!catalogId) {
      await syncStore.failIntent(execution.intentId, CATALOG_ERROR)
      execution.onError(CATALOG_ERROR)
      return
    }
    await resumeLinkIntent(execution.intentId)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    await syncStore.failIntent(execution.intentId, message).catch(() => undefined)
    execution.onError(message)
  } finally {
    forgetLinkTargets(execution.targetIds)
  }
}

/**
 * Resumes every unresolved link intent. Called from startup and reconnection;
 * it never adds targets and never replays a stored movement snapshot: each
 * target is rebuilt from the movement's current state.
 */
export async function resumeInstrumentLinks(): Promise<void> {
  if (isReadOnlyDemoActive()) return
  const syncStore = useSyncStore()
  if (!syncStore.userId) return
  const views = await syncStore.listIntents()
  for (const view of views) {
    if (view.intent.kind !== 'instrumentLink') continue
    if (!isUnresolvedIntent(view.intent)) continue
    if (view.intent.ownerUserId !== syncStore.userId) continue
    // A definitive failure waits for the user's explicit retry; a discard
    // waits for reconciliation of whatever request is still in flight.
    if (view.intent.failure || view.intent.discardRequested) continue
    await resumeLinkIntent(view.intent.id)
  }
}

async function resumeLinkIntent(intentId: string): Promise<void> {
  const syncStore = useSyncStore()
  const financialStore = useFinancialStateStore()
  const view = (await syncStore.listIntents()).find((item) => item.intent.id === intentId)
  if (!view || !isUnresolvedIntent(view.intent)) return
  if (view.intent.failure || view.intent.discardRequested) return
  if (view.steps.some((step) => step.state === 'queued' || step.state === 'sending')) {
    // The durable queue already owns this work; flush/commit will finish it.
    return
  }
  const instrumentId = view.intent.payload.instrumentId
  if (typeof instrumentId !== 'string') return
  if (!(await syncStore.getInstrumentId(instrumentId))) {
    await syncStore.markIntentWaiting(intentId, 'catalog')
    return
  }
  const pending = view.steps.filter((step) => step.state === 'pending')
  if (pending.length === 0) return
  for (const step of pending) {
    await publishLinkedTarget(intentId, instrumentId, step.step, financialStore.currency)
  }
}

async function publishLinkedTarget(
  intentId: string,
  instrumentId: string,
  movementId: string,
  currency: string,
): Promise<void> {
  const financialStore = useFinancialStateStore()
  const syncStore = useSyncStore()
  const writerId = movementPublicationWriterId()
  let attempts = 0
  let refreshed = false
  while (attempts < 3) {
    attempts += 1
    const movement = financialStore.transactions.find((item) => item.id === movementId)
    if (!movement || movement.type !== 'investment') {
      // Deleted or no longer an investment: the continuation must not
      // resurrect it. The cancelling transaction is the durable record.
      await syncStore.cancelIntentStep(intentId, movementId)
      return
    }

    const record = (await syncStore.readMovementPublications([movementId])).get(movementId)
    if (!isCompatible(record, instrumentId)) {
      await syncStore.cancelIntentStep(intentId, movementId)
      return
    }
    if (movement.instrumentId && movement.instrumentId !== instrumentId) {
      // A later explicit link to another instrument wins.
      await syncStore.cancelIntentStep(intentId, movementId)
      return
    }

    // The pull that confirms the configuration rebuilds the state from the
    // server, where this not-yet-published link is absent. Re-apply the
    // link's own intent; a later explicit unlink is already an incompatible
    // record and was rejected above.
    if (!movement.instrumentId) {
      financialStore.commitState((draft) => {
        const transaction = draft.transactions.find((item) => item.id === movementId)
        if (transaction) transaction.instrumentId = instrumentId
      })
    }
    const live = financialStore.transactions.find((item) => item.id === movementId)
    if (!live || live.type !== 'investment') {
      await syncStore.cancelIntentStep(intentId, movementId)
      return
    }
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
      // pending for a later retry rather than publish a stale command.
      refreshed = true
      await syncStore.syncNow()
      if (syncStore.connection === 'offline') return
      continue
    }

    const data = await buildMovementData(live, currency)
    if (!data) {
      // A required private reference (account/category) is still unresolved;
      // keep the intent pending instead of publishing an incomplete command.
      await syncStore.markIntentWaiting(intentId, 'private-configuration')
      return
    }
    const ref = await syncStore.getEntityRef('transaction', movementId)
    const input: MovementPublicationInput = {
      movementId,
      plan: {
        action: 'update',
        patch: data,
        ...(ref ? { ref: { entityId: ref.entityId, baseVersion: ref.version } } : {}),
      },
      origin: 'instrumentLink',
      type: live.type,
      instrumentId,
      fingerprint,
      expectedGeneration: record?.generation ?? 0,
      link: { instrumentId },
      intent: { intentId, step: movementId },
    }
    const [result] = await syncStore.publishMovementCommands([input])
    if (!result) return
    if (result.outcome === 'published' || result.outcome === 'skipped') return
    if (result.outcome === 'unresolved') {
      await syncStore.markIntentWaiting(intentId, 'private-configuration')
      return
    }
    // Stale: the persisted generation moved after this attempt was built.
    if (!isCompatible(result.record, instrumentId)) {
      await syncStore.cancelIntentStep(intentId, movementId)
      return
    }
    if (result.record?.writerId === writerId) continue
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
 * Re-evaluates a link-owned command from the previous build that carries no
 * durable intent yet (#489 queues upgraded from version 2). New links always
 * carry an intent and are recovered by `resumeInstrumentLinks`.
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

/** The unresolved intents, for a status surface that only needs names/counts. */
export function summarizeIntent(view: DurableIntentView): {
  confirmed: number
  pending: number
  failed: number
  cancelled: number
} {
  return {
    confirmed: view.steps.filter((step) => step.state === 'confirmed').length,
    pending: view.steps.filter(
      (step) => step.state === 'pending' || step.state === 'queued' || step.state === 'sending',
    ).length,
    failed: view.steps.filter((step) => step.state === 'failed').length,
    cancelled: view.steps.filter((step) => step.state === 'cancelled').length,
  }
}
