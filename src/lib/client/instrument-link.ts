/**
 * Durable instrument link (#489/#490/#491).
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
 * A quote configured moments ago has no catalog reference yet (#491). The
 * configuration becomes one of the intent's own steps — either a command
 * adopted from the queue (the one `addInstrument` already wrote) or a fresh
 * command accepted/published in the acceptance transaction — and the movement
 * steps stay pending until the reference exists. A missing cache entry is a
 * temporary wait (`waiting: catalog`), never a failed link: the confirmation
 * absorbed from the sync response (or the bootstrap it triggers) is what
 * resolves the reference and publishes the movements.
 */

import { unlinkedMovementIdsForInstrument } from '../../domain/investment/symbol-matching'
import type { Instrument, Transaction } from '../../scripts/types'
import { useFinancialStateStore } from '../../stores/financial-state'
import { useSyncStore } from '../../stores/sync'
import { resolveEntityId } from './command-mapping'
import { isReadOnlyDemoActive } from './demo-source'
import {
  isUnresolvedIntent,
  type AdoptIntentCommandInput,
  type DurableIntentView,
  type IntentCommandInput,
  type IntentPayload,
  type IntentWaitReason,
} from './durable-intents'
import { rememberLinkTargets } from './link-targets'
import { buildMovementData, movementFingerprint } from './movement-commands'
import {
  movementPublicationWriterId,
  type MovementPublicationInput,
  type MovementPublicationRecord,
} from './movement-publication'
import type { OutboxCommandInput } from './outbox'

/** The intent step that carries the private quote configuration. */
export const LINK_CONFIGURATION_STEP = 'configuration'

export interface InstrumentLinkRequest {
  instrumentId: string
  onError: (message: string) => void
}

export interface InstrumentLinkAcceptance {
  /** Movements fixed at click time (the optimistic projection the UI shows). */
  targets: number
  /** True once the intent and its fixed ids are durable in this browser. */
  accepted: boolean
}

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

  const dependency = await captureConfigurationDependency(instrument)
  // Durable acceptance comes first: nothing is reported or projected as
  // accepted until the intent, its original ids and its configuration
  // dependency are in IndexedDB.
  const accepted = await syncStore.acceptIntent({
    kind: 'instrumentLink',
    ownerUserId: ownerId,
    targetIds,
    steps: [...(dependency ? [LINK_CONFIGURATION_STEP] : []), ...targetIds],
    // The accepted private configuration travels with the intent (scalar
    // fields: the payload is not a place for a structured snapshot). It lets
    // a definitive configuration failure be retried after a reload even when
    // the quote never reached the server and left the local projection.
    payload: {
      instrumentId: instrument.id,
      investmentAssetId: instrument.investmentAssetId,
      quoteConfig: JSON.stringify(liveConfiguration(instrument).quoteConfig),
      ...(assetName ? { assetName } : {}),
    },
    ...(dependency?.acceptance ?? {}),
  })
  if (!accepted) return { targets: targetIds.length, accepted: false }

  applyOptimisticLink(instrument.id, targetIds)
  rememberLinkTargets(targetIds, instrument.id)
  void executeInstrumentLink({
    intentId: accepted.intent.id,
    ownerId,
    instrumentId: instrument.id,
    onError: request.onError,
  })
  return { targets: targetIds.length, accepted: true }
}

interface ConfigurationDependency {
  /**
   * The commands step to accept with the intent. `adopt` takes over the
   * command `addInstrument` already queued; `commands` publishes a fresh one
   * in the same transaction. Both are absent when the configuration references
   * (the investment account) cannot be resolved yet: the intent is accepted
   * `waiting` and the same records are retried, never a sent command rebuilt.
   */
  acceptance:
    | { adopt: AdoptIntentCommandInput[] }
    | { commands: IntentCommandInput[] }
    | { waitingFor: IntentWaitReason }
}

/**
 * Whether the movement commands need the confirmed catalog reference, and the
 * configuration work that will produce it. The reference lives in the private
 * configuration's server row, not in the local instrument id: it only exists
 * after the `userInstrument` command is applied.
 */
async function captureConfigurationDependency(
  instrument: Instrument,
): Promise<ConfigurationDependency | null> {
  const syncStore = useSyncStore()
  if (await syncStore.getInstrumentId(instrument.id)) return null
  const trackingId = await syncStore.getUserInstrumentId(instrument.id)
  const queued = await syncStore.findQueuedUserInstrumentCommand(instrument.id, trackingId)
  if (queued && queued.action !== 'remove')
    return { acceptance: { adopt: [{ step: LINK_CONFIGURATION_STEP, seq: queued.seq }] } }
  const command = await buildConfigurationCommand(liveConfiguration(instrument))
  return command
    ? { acceptance: { commands: [{ step: LINK_CONFIGURATION_STEP, command }] } }
    : { acceptance: { waitingFor: 'private-configuration' } }
}

interface ConfigurationSource {
  instrumentId: string
  investmentAssetId: string
  quoteConfig: Record<string, unknown>
}

/** The quote configuration as it lives in the financial state right now. */
function liveConfiguration(instrument: Instrument): ConfigurationSource {
  const { id, investmentAssetId, ...quoteConfig } = instrument
  return { instrumentId: id, investmentAssetId, quoteConfig }
}

/** The configuration accepted with the intent, for rebuilding after a reload. */
function persistedConfiguration(payload: IntentPayload): ConfigurationSource | null {
  const { instrumentId, investmentAssetId, quoteConfig } = payload
  if (
    typeof instrumentId !== 'string' ||
    typeof investmentAssetId !== 'string' ||
    typeof quoteConfig !== 'string'
  )
    return null
  try {
    const parsed = JSON.parse(quoteConfig) as unknown
    if (!parsed || typeof parsed !== 'object') return null
    return {
      instrumentId,
      investmentAssetId,
      quoteConfig: parsed as Record<string, unknown>,
    }
  } catch {
    return null
  }
}

/**
 * Builds the private configuration command from the accepted configuration —
 * the live instrument when it still exists (later edits win), else the copy
 * carried by the intent. It is a `create` while the row has never reached the
 * server (idempotent by client identity, ADR 0001) and an `update` once it
 * exists.
 */
async function buildConfigurationCommand(
  source: ConfigurationSource,
): Promise<OutboxCommandInput | null> {
  const syncStore = useSyncStore()
  const alias = await resolveEntityId('account', source.investmentAssetId)
  if (!alias) return null
  const trackingId = await syncStore.getUserInstrumentId(source.instrumentId)
  if (!trackingId) {
    return {
      action: 'create',
      entityType: 'userInstrument',
      data: {
        id: source.instrumentId,
        instrumentId: source.instrumentId,
        alias,
        quoteConfig: source.quoteConfig,
      },
    }
  }
  const ref = await syncStore.getEntityRef('userInstrument', trackingId)
  if (!ref) return null
  return {
    action: 'update',
    entityType: 'userInstrument',
    entityId: ref.entityId,
    baseVersion: ref.version,
    patch: { alias, quoteConfig: source.quoteConfig },
  }
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
  instrumentId: string
  onError: InstrumentLinkRequest['onError']
}

async function executeInstrumentLink(execution: InstrumentLinkExecution): Promise<void> {
  const syncStore = useSyncStore()
  const stillOwner = () => syncStore.userId === execution.ownerId && !isReadOnlyDemoActive()

  try {
    await resumeLinkIntent(execution.intentId)
    if (!stillOwner()) return
    // Publishing is local; this just starts sending. There is no manual sync
    // step in the link protocol: an offline link stays queued and a later
    // startup/reconnection resumes it from the intent.
    void syncStore.syncNow()
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    await syncStore.failIntent(execution.intentId, message).catch(() => undefined)
    execution.onError(message)
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
    // The link's expected instrument is a page-local fact; rehydrate it after
    // a reload so an ordinary edit that clears the instrument is still
    // recorded as the user's later explicit unlink.
    const linkedInstrumentId = view.intent.payload.instrumentId
    if (typeof linkedInstrumentId === 'string') {
      rememberLinkTargets(view.intent.targetIds, linkedInstrumentId)
    }
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
  const instrumentId = view.intent.payload.instrumentId
  if (typeof instrumentId !== 'string') return

  // The private configuration is the first dependency: the movement's
  // operation must carry the server's catalog reference, never the local id.
  const configuration = view.steps.find((step) => step.step === LINK_CONFIGURATION_STEP)
  if (configuration) {
    if (configuration.state === 'failed' || configuration.state === 'cancelled') return
    if (configuration.state === 'queued' || configuration.state === 'sending') {
      if (await syncStore.findIntentCommand(intentId, LINK_CONFIGURATION_STEP)) {
        // The queue owns it; the flush confirms it and the resume that follows
        // the confirmation wakes the movement steps.
        return
      }
      // Its command disappeared before it was acknowledged. If the catalog
      // reference is already visible the effect exists; otherwise rebuild the
      // same content as a fresh (idempotent) attempt.
      if (await syncStore.getInstrumentId(instrumentId)) {
        await syncStore.completeIntentStep(intentId, LINK_CONFIGURATION_STEP)
      } else {
        await syncStore.reopenIntentStep(intentId, LINK_CONFIGURATION_STEP)
      }
      return resumeLinkIntent(intentId)
    }
    if (configuration.state === 'pending') {
      const catalogId = await syncStore.getInstrumentId(instrumentId)
      if (catalogId) {
        await syncStore.completeIntentStep(intentId, LINK_CONFIGURATION_STEP)
        return resumeLinkIntent(intentId)
      }
      const instrument = financialStore.instruments.find((item) => item.id === instrumentId)
      const trackingId = await syncStore.getUserInstrumentId(instrumentId)
      const queued =
        instrument || trackingId
          ? null
          : await syncStore.findQueuedUserInstrumentCommand(instrumentId, trackingId)
      if (!instrument && queued?.action === 'remove') {
        // The user deleted the quote while the link waited: its later choice
        // wins instead of resurrecting the configuration.
        await syncStore.failIntent(intentId, 'La cotización se eliminó; descarta la vinculación.')
        return
      }
      const source = instrument
        ? liveConfiguration(instrument)
        : persistedConfiguration(view.intent.payload)
      if (!source) {
        await syncStore.failIntent(intentId, 'La cotización ya no existe en este dispositivo.')
        return
      }
      const command = await buildConfigurationCommand(source)
      if (!command) {
        await syncStore.markIntentWaiting(intentId, 'private-configuration')
        return
      }
      const published = await syncStore.publishIntentCommands(intentId, [
        { step: LINK_CONFIGURATION_STEP, command },
      ])
      if (published?.published.length) {
        void syncStore.syncNow()
      } else if (published) {
        // Another tab already moved the step forward; its confirmation wakes us.
        await syncStore.markIntentWaiting(intentId, 'catalog')
      }
      return
    }
  }

  const catalogId = await syncStore.getInstrumentId(instrumentId)
  if (!catalogId) {
    // Temporary: the confirmation that materializes the reference is either
    // in flight (configuration step queued) or pending a cache refresh.
    await syncStore.markIntentWaiting(intentId, 'catalog')
    void syncStore.syncNow()
    return
  }
  const pending = view.steps.filter(
    (step) => step.state === 'pending' && step.step !== LINK_CONFIGURATION_STEP,
  )
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
      if (!(await refreshBeforeRebuild(syncStore))) return
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
    if (!(await refreshBeforeRebuild(syncStore))) return
  }
}

/**
 * Pulls the other tab's state before rebuilding a movement, unless a sync
 * cycle is already running: this runs from that cycle's own resume hook, so
 * awaiting `syncNow()` there would wait on the cycle it belongs to. The
 * pending target is then retried after the cycle pulls.
 */
async function refreshBeforeRebuild(syncStore: ReturnType<typeof useSyncStore>): Promise<boolean> {
  if (syncStore.syncStatus === 'syncing') return false
  await syncStore.syncNow()
  return syncStore.connection !== 'offline'
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
