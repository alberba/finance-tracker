import { createHmac } from 'node:crypto'
import Decimal from 'decimal.js'
import { describe, expect, it, vi } from 'vitest'
import {
  analyzeTransaction,
  captureHistory,
  requireContract,
  readValidatedOperation,
  sanitizeTransaction,
  transactionSchema,
} from '../../scripts/lib/bitvavo-contract'
import fixture from './fixtures/bitvavo-synthetic.json'
import realFixture from './fixtures/bitvavo-real-sanitized.json'
import zeroFixture from './fixtures/bitvavo-zero-fee-assumed.json'

const [buy, sell] = fixture.transactions.map((item) => transactionSchema.parse(item))
const realTransactions = realFixture.transactions.map((item) => transactionSchema.parse(item))
const assumedZeroTransactions = zeroFixture.transactions.map((item) =>
  transactionSchema.parse(item),
)

describe('contrato Bitvavo fijado por compra y venta reales saneadas', () => {
  it.each(realTransactions)('conserva precio unitario y flujo bruto en $type', (transaction) => {
    expect(requireContract(transaction)).toEqual({ priceKind: 'unit', cashFlow: 'gross' })
    const operation = readValidatedOperation(transaction)
    expect(operation.unitPrice).toBe(transaction.priceAmount)
    expect(operation.fee).toBe(transaction.feesAmount)
    expect(
      new Decimal(operation.quantity).times(operation.unitPrice).eq(operation.grossAmount),
    ).toBe(true)
  })

  it.each(realTransactions)(
    'aplica la comisión una sola vez al flujo de caja de $type',
    (transaction) => {
      const operation = readValidatedOperation(transaction)
      const gross = new Decimal(operation.grossAmount)
      const cash =
        transaction.type === 'buy' ? gross.plus(operation.fee) : gross.minus(operation.fee)
      expect(operation.cashAmount).toBe(cash.toFixed())
      expect(operation.currency).toBe('EUR')
      expect(operation.symbol).toBe(
        transaction.type === 'buy' ? transaction.receivedCurrency : transaction.sentCurrency,
      )
    },
  )

  it.each(assumedZeroTransactions)(
    'acepta comisión cero EUR según el supuesto acordado en $type',
    (transaction) => {
      const operation = readValidatedOperation(transaction)
      expect(operation.fee).toBe('0')
      expect(new Decimal(operation.cashAmount).eq(operation.grossAmount)).toBe(true)
    },
  )

  it('usa el contrato ya fijado cuando una cantidad de uno no distingue precio unitario de total', () => {
    expect(
      readValidatedOperation({ ...buy, receivedAmount: '1', sentAmount: '100', feesAmount: '0' })
        .unitPrice,
    ).toBe('100')
  })

  it('rechaza la alternativa de precio total aunque la herramienta de investigación pueda reconocerla', () => {
    expect(() => readValidatedOperation({ ...sell, receivedAmount: '20' })).toThrow(
      'contrato validado',
    )
  })

  it('rechaza flujos netos para evitar sumar o restar dos veces la comisión', () => {
    expect(() => readValidatedOperation(buy)).toThrow('contrato validado')
    expect(() => readValidatedOperation({ ...sell, priceAmount: '100' })).toThrow(
      'contrato validado',
    )
  })

  it('no amplía el supuesto de comisión cero a una moneda nula o ausente', () => {
    expect(() =>
      readValidatedOperation({ ...buy, sentAmount: '20', feesAmount: '0', feesCurrency: null }),
    ).toThrow('contrato validado')
    const { feesCurrency: omitted, ...withoutFeeCurrency } = assumedZeroTransactions[0]
    expect(omitted).toBe('EUR')
    expect(transactionSchema.safeParse(withoutFeeCurrency).success).toBe(false)
  })
})

describe('herramienta de validación Bitvavo (evidencia sintética)', () => {
  it('distingue precio unitario y total y reconoce la comisión incluida en cada lado', () => {
    expect(requireContract(buy)).toEqual({ priceKind: 'unit', cashFlow: 'net' })
    expect(requireContract(sell)).toEqual({ priceKind: 'total', cashFlow: 'net' })
  })

  it('reconoce flujos brutos sin añadir la comisión', () => {
    expect(requireContract({ ...buy, sentAmount: '20' })).toEqual({
      priceKind: 'unit',
      cashFlow: 'gross',
    })
    expect(requireContract({ ...sell, receivedAmount: '20' })).toEqual({
      priceKind: 'total',
      cashFlow: 'gross',
    })
  })

  it('rechaza una cantidad de uno que hace indistinguibles los dos precios', () => {
    expect(() => requireContract({ ...buy, receivedAmount: '1', sentAmount: '100.05' })).toThrow(
      'ambiguo',
    )
  })

  it('con comisión cero no inventa si los flujos son brutos o netos', () => {
    const zero = { ...buy, sentAmount: '20', feesAmount: '0', feesCurrency: null }
    expect(analyzeTransaction(zero)).toEqual({
      zeroFee: true,
      candidates: [
        { priceKind: 'unit', cashFlow: 'gross' },
        { priceKind: 'unit', cashFlow: 'net' },
      ],
    })
    expect(() => requireContract(zero)).toThrow('ambiguo')
    expect(sanitizeTransaction(zero, 'unit', 0).feesCurrency).toBeNull()
  })

  it('rechaza flujos incompatibles en vez de dividir para inventar un precio', () => {
    expect(() => requireContract({ ...buy, sentAmount: '99' })).toThrow('incompatible')
  })

  it('rechaza comisiones en cripto y cantidades nulas', () => {
    expect(() => analyzeTransaction({ ...buy, feesCurrency: 'BTC' })).toThrow('Monedas')
    expect(() => analyzeTransaction({ ...buy, receivedAmount: '0' })).toThrow('positivos')
  })

  it('mantiene igualdad decimal exacta con cantidades pequeñas', () => {
    expect(
      requireContract({
        ...buy,
        priceAmount: '0.1',
        receivedAmount: '0.2',
        sentAmount: '0.03',
        feesAmount: '0.01',
      }),
    ).toEqual({ priceKind: 'unit', cashFlow: 'net' })
  })

  it.each([
    [buy, 'unit'],
    [sell, 'total'],
  ] as const)('sanea manteniendo el contrato de %s', (transaction, kind) => {
    const withPrivateField = { ...transaction, address: 'private-address' }
    const sanitized = sanitizeTransaction(withPrivateField, kind, 0)
    expect(requireContract(sanitized)).toEqual(requireContract(transaction))
    expect(sanitized.transactionId).toBe('example-1')
    expect(sanitized).not.toHaveProperty('address')
    expect(sanitized.sentAmount).not.toBe(transaction.sentAmount)
    expect(sanitized.priceAmount === transaction.priceAmount).toBe(kind === 'unit')
  })

  it('impide sanear usando una semántica que los datos no sostienen', () => {
    expect(() => sanitizeTransaction(buy, 'total', 0)).toThrow('semántica')
  })

  it('pagina, firma la query enviada y elimina campos privados antes de conservar ejemplos', async () => {
    const request = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        Response.json({
          currentPage: 1,
          totalPages: 2,
          items: [{ ...buy, address: 'private' }, { type: 'deposit' }],
        }),
      )
      .mockResolvedValueOnce(Response.json({ currentPage: 2, totalPages: 2, items: [sell] }))
    const result = await captureHistory({
      key: 'test-key',
      secret: 'test-secret',
      fromDate: 0,
      toDate: 1000,
      request,
    })
    expect(result).toEqual([buy, sell])
    expect(request).toHaveBeenCalledTimes(2)
    const [url, options] = request.mock.calls[1]
    const headers = new Headers(options?.headers)
    expect(String(url)).toContain('page=2')
    expect(options?.method).toBe('GET')
    const expected = createHmac('sha256', 'test-secret')
      .update(
        `${headers.get('Bitvavo-Access-Timestamp')}GET${new URL(String(url)).pathname}${new URL(String(url)).search}`,
      )
      .digest('hex')
    expect(headers.get('Bitvavo-Access-Signature')).toBe(expected)
  })

  it('no incorpora el cuerpo remoto a un error de permisos', async () => {
    const request = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response('private-secret', { status: 403 }))
    await expect(
      captureHistory({ key: 'key', secret: 'secret', fromDate: 0, toDate: 1, request }),
    ).rejects.toThrow('Bitvavo HTTP 403')
  })

  it('rechaza una compra malformada sin exponer su valor privado', async () => {
    const request = vi.fn<typeof fetch>().mockResolvedValue(
      Response.json({
        currentPage: 1,
        totalPages: 1,
        items: [{ ...buy, priceAmount: 'private-secret' }],
      }),
    )
    await expect(
      captureHistory({ key: 'key', secret: 'secret', fromDate: 0, toDate: 1, request }),
    ).rejects.toThrow('forma incompatible')
  })
})
