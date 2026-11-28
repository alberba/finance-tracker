import { Schema } from 'effect'

import { validator } from './schema'

export interface RemoteOperation {
  provider: 'bitvavo'
  externalId: string
  executedAt: string
  timeZone: string
  date: string
  time: string
  side: 'buy' | 'sell'
  symbol: string
  quantity: string
  unitPrice: string
  fee: string
  cashAmount: string
  currency: 'EUR'
}

export interface BitvavoPreview {
  connectionVersion: number
  id: string
  accountId: string
  from: number
  to: number
  timeZone: string
  operations: Array<
    RemoteOperation & {
      candidates: Array<{ id: string; description: string; date: string }>
      alreadyImported: boolean
    }
  >
  incompatible: SkippedOperation[]
}

/** An operation left out of the import: identity, instant and reason only. */
export interface SkippedOperation {
  externalId: string
  executedAt: string | null
  reason: string
}

/** Outcome of the last attempt; `attention` means the credential must be replaced. */
export type BitvavoSyncStatus = 'success' | 'warning' | 'failed' | 'attention'

export interface BitvavoSyncCounts {
  created: number
  updated: number
  unchanged: number
  skipped: number
}

/** What the panel shows about a configured connection (never credentials). */
export interface BitvavoConnectionState {
  accountId: string
  startDate: string
  timeZone: string
  cursor: number | null
  /** The first import completed: later runs synchronize incrementally. */
  imported: boolean
  needsAttention: boolean
  lastAttemptAt: number | null
  lastAttemptStatus: BitvavoSyncStatus | null
  lastError: string | null
  lastSuccessAt: number | null
  lastCounts: BitvavoSyncCounts | null
  skipped: SkippedOperation[]
}
export interface DuplicateResolution {
  externalId: string
  transactionId: string | null
}

export const remoteOperationSchema = validator(
  Schema.Struct({
    provider: Schema.Literal('bitvavo'),
    externalId: Schema.String,
    executedAt: Schema.String.check(
      Schema.isPattern(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/),
    ),
    timeZone: Schema.String,
    date: Schema.String.check(Schema.isPattern(/^\d{4}-\d{2}-\d{2}$/)),
    time: Schema.String,
    side: Schema.Literals(['buy', 'sell']),
    symbol: Schema.String,
    quantity: Schema.String,
    unitPrice: Schema.String,
    fee: Schema.String,
    cashAmount: Schema.String,
    currency: Schema.Literal('EUR'),
  }),
  // The stored row also carries the preview's `alreadyImported`/`candidates`;
  // the projection only reads the operation fields, as zod's default did.
  { onExcessProperty: 'ignore' },
)
