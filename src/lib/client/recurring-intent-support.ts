/**
 * Small protocol vocabulary shared by the two recurring write modules
 * (#492/#493): step lookup, durable-step check, payload decoding for the
 * scalar intent fields, the flattened investment operation and a nonce.
 *
 * It is deliberately not a flow executor: the financial decisions, the
 * ordering rules and the accept/retry/discard semantics stay in
 * `recurring-write.ts` (pending confirmations) and `recurring-rule-write.ts`
 * (rules, occurrences and calendar), which have different invariants.
 *
 * Boundary note (ADR-0006): both modules are invoked exclusively from Pinia
 * actions — the documented Effect edge. They orchestrate promises over the
 * Effect-based storage protocol (`durable-intents`/`movement-publication`/
 * `outbox`); Effect primitives stay in those modules.
 */

import type { InvestmentSide } from '../../scripts/types'
import type { DurableIntentView, IntentPayload, IntentProgressRecord } from './durable-intents'

/** Message persisted when a discard finds an in-flight request to reconcile. */
export const RECONCILING_MESSAGE =
  'Se está reconciliando un envío en curso; inténtalo de nuevo en unos segundos.'

export function stepOf(view: DurableIntentView, step: string): IntentProgressRecord | undefined {
  return view.steps.find((item) => item.step === step)
}

/** A step whose command already exists (or exists at the server) cannot be rebuilt. */
export function isDurableStep(step: IntentProgressRecord): boolean {
  return step.state === 'queued' || step.state === 'sending' || step.state === 'confirmed'
}

export function payloadText(payload: IntentPayload, key: string): string | null {
  const value = payload[key]
  return typeof value === 'string' && value.length > 0 ? value : null
}

export function payloadNumber(payload: IntentPayload, key: string): number | null {
  const value = payload[key]
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

/** The operation of an investment template, flattened as the commands expect. */
export function operationData(template: {
  symbol?: string
  side?: InvestmentSide
  units?: number
  unitPrice?: number
  fee?: number
  time?: string
}) {
  return {
    symbol: template.symbol ?? null,
    side: template.side ?? null,
    units: template.units ?? null,
    unitPrice: template.unitPrice ?? null,
    fee: template.fee ?? null,
    time: template.time ?? null,
  }
}

/** A unique suffix for one accepted write; a reload never mints the same one. */
export function mintNonce(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`
}
