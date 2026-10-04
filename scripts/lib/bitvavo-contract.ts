import { createHmac } from 'node:crypto'
import Decimal from 'decimal.js'
import { z } from 'zod'

const ExactDecimal = Decimal.clone({ precision: 100 })
const amount = z
  .string()
  .regex(/^\d+(?:\.\d+)?$/)
  .max(40)
const currency = z.string().regex(/^[A-Z0-9]{1,20}$/)

export const transactionSchema = z.object({
  transactionId: z.string().min(1),
  executedAt: z.iso.datetime(),
  type: z.enum(['buy', 'sell']),
  priceCurrency: currency,
  priceAmount: amount,
  sentCurrency: currency,
  sentAmount: amount,
  receivedCurrency: currency,
  receivedAmount: amount,
  feesCurrency: currency.nullable(),
  feesAmount: amount,
})

export type Transaction = z.infer<typeof transactionSchema>
export type PriceKind = 'unit' | 'total'

export class ContractError extends Error {}

const pageSchema = z.object({
  items: z.array(z.unknown()),
  currentPage: z.number().int().positive(),
  totalPages: z.number().int().nonnegative(),
})

export function signature(secret: string, timestamp: string, path: string): string {
  return createHmac('sha256', secret).update(`${timestamp}GET${path}`).digest('hex')
}

export async function captureHistory(options: {
  key: string
  secret: string
  fromDate: number
  toDate: number
  request?: typeof fetch
}): Promise<Transaction[]> {
  const request = options.request ?? fetch
  const examples = new Map<string, Transaction>()
  for (let page = 1; page <= 100; page++) {
    const query = new URLSearchParams({
      fromDate: String(options.fromDate),
      toDate: String(options.toDate),
      page: String(page),
      maxItems: '100',
    })
    const path = `/v2/account/history?${query}`
    const timestamp = String(Date.now())
    const response = await request(`https://api.bitvavo.com${path}`, {
      method: 'GET',
      redirect: 'error',
      signal: AbortSignal.timeout(15_000),
      headers: {
        'Bitvavo-Access-Key': options.key,
        'Bitvavo-Access-Timestamp': timestamp,
        'Bitvavo-Access-Signature': signature(options.secret, timestamp, path),
      },
    })
    if (!response.ok) throw new ContractError(`Bitvavo HTTP ${response.status}`)
    const result = pageSchema.safeParse(await response.json())
    if (!result.success || result.data.currentPage !== page) {
      throw new ContractError('Página de historial incompatible')
    }
    for (const item of result.data.items) {
      const type = z.object({ type: z.string() }).safeParse(item)
      if (!type.success) throw new ContractError('Transacción sin tipo válido')
      if (type.data.type !== 'buy' && type.data.type !== 'sell') continue
      const parsed = transactionSchema.safeParse(item)
      if (!parsed.success) throw new ContractError('Compra o venta con forma incompatible')
      const transaction = parsed.data
      if (transaction.priceCurrency !== 'EUR') continue
      const slot = `${transaction.type}:${new ExactDecimal(transaction.feesAmount).isZero() ? 'zero' : 'fee'}`
      if (!examples.has(slot)) examples.set(slot, transaction)
    }
    if (page >= result.data.totalPages) return [...examples.values()]
  }
  throw new ContractError('Más de 100 páginas: reduce el intervalo de fechas')
}

export function analyzeTransaction(input: Transaction) {
  const transaction = transactionSchema.parse(input)
  const buying = transaction.type === 'buy'
  const cashCurrency = buying ? transaction.sentCurrency : transaction.receivedCurrency
  const assetCurrency = buying ? transaction.receivedCurrency : transaction.sentCurrency
  if (
    transaction.priceCurrency !== 'EUR' ||
    cashCurrency !== 'EUR' ||
    assetCurrency === 'EUR' ||
    (transaction.feesCurrency !== 'EUR' &&
      !(transaction.feesCurrency === null && new ExactDecimal(transaction.feesAmount).isZero()))
  ) {
    throw new ContractError('Monedas incompatibles con una operación EUR')
  }
  const quantity = new ExactDecimal(buying ? transaction.receivedAmount : transaction.sentAmount)
  const cash = new ExactDecimal(buying ? transaction.sentAmount : transaction.receivedAmount)
  const price = new ExactDecimal(transaction.priceAmount)
  const fee = new ExactDecimal(transaction.feesAmount)
  if (!quantity.gt(0) || !cash.gt(0) || !price.gt(0)) {
    throw new ContractError('Cantidad, flujo y precio deben ser positivos')
  }
  const candidates: { priceKind: PriceKind; cashFlow: 'gross' | 'net' }[] = []
  for (const priceKind of ['unit', 'total'] as const) {
    const gross = priceKind === 'unit' ? price.times(quantity) : price
    if (cash.eq(gross)) candidates.push({ priceKind, cashFlow: 'gross' })
    if (cash.eq(buying ? gross.plus(fee) : gross.minus(fee))) {
      candidates.push({ priceKind, cashFlow: 'net' })
    }
  }
  return { candidates, zeroFee: fee.isZero() }
}

export function requireContract(transaction: Transaction) {
  const analysis = analyzeTransaction(transaction)
  if (analysis.candidates.length !== 1) {
    throw new ContractError('Contrato ambiguo o incompatible: requiere contraste con Bitvavo')
  }
  return analysis.candidates[0]
}

export function readValidatedOperation(input: Transaction) {
  const transaction = transactionSchema.parse(input)
  const analysis = analyzeTransaction(transaction)
  if (
    transaction.feesCurrency !== 'EUR' ||
    !analysis.candidates.some(
      (candidate) => candidate.priceKind === 'unit' && candidate.cashFlow === 'gross',
    )
  ) {
    throw new ContractError(
      'Respuesta incompatible con el contrato validado: precio unitario y flujo bruto EUR',
    )
  }
  const buying = transaction.type === 'buy'
  const grossAmount = buying ? transaction.sentAmount : transaction.receivedAmount
  const gross = new ExactDecimal(grossAmount)
  const fee = new ExactDecimal(transaction.feesAmount)
  if (!buying && fee.gt(gross)) throw new ContractError('La comisión supera el importe de venta')
  return {
    side: transaction.type,
    symbol: buying ? transaction.receivedCurrency : transaction.sentCurrency,
    quantity: buying ? transaction.receivedAmount : transaction.sentAmount,
    unitPrice: transaction.priceAmount,
    fee: transaction.feesAmount,
    currency: 'EUR' as const,
    grossAmount,
    cashAmount: (buying ? gross.plus(fee) : gross.minus(fee)).toFixed(),
  }
}

export function sanitizeTransaction(input: Transaction, priceKind: PriceKind, index: number) {
  const transaction = transactionSchema.parse(input)
  if (
    !analyzeTransaction(transaction).candidates.some(
      (candidate) => candidate.priceKind === priceKind,
    )
  ) {
    throw new ContractError('La semántica elegida no concuerda con los flujos')
  }
  // Scale quantity, cash and fee together; unit price must remain unchanged.
  const scaled = (value: string) => new ExactDecimal(value).times('0.137').toFixed()
  return {
    ...transaction,
    transactionId: `example-${index + 1}`,
    executedAt: new Date(Date.UTC(2020, 0, 1, 0, index)).toISOString(),
    priceAmount: priceKind === 'total' ? scaled(transaction.priceAmount) : transaction.priceAmount,
    sentAmount: scaled(transaction.sentAmount),
    receivedAmount: scaled(transaction.receivedAmount),
    feesAmount: scaled(transaction.feesAmount),
  }
}
