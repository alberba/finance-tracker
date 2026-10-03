import { z } from 'zod'
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
  incompatible: Array<{ externalId: string; reason: string }>
}
export interface DuplicateResolution {
  externalId: string
  transactionId: string | null
}

export const remoteOperationSchema = z.object({
  provider: z.literal('bitvavo'),
  externalId: z.string(),
  executedAt: z.iso.datetime(),
  timeZone: z.string(),
  date: z.iso.date(),
  time: z.string(),
  side: z.enum(['buy', 'sell']),
  symbol: z.string(),
  quantity: z.string(),
  unitPrice: z.string(),
  fee: z.string(),
  cashAmount: z.string(),
  currency: z.literal('EUR'),
}) satisfies z.ZodType<RemoteOperation>
