import { afterEach, describe, expect, it, vi } from 'vitest'
import { getInvestmentBuckets } from '../../src/domain/investment/buckets'
import { formatDecimalInput, parseDecimal, round2 } from '../../src/lib/number'
import { createJsonResponse } from '../../src/lib/server/json-response'
import { resolveCssColor } from '../../src/scripts/css-color'

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('shared helpers', () => {
  it('agrupa fondos y cripto usando el calculador recibido', () => {
    const values: Record<string, number> = { funds: 120, bitcoin: 80, other: 40 }
    const buckets = getInvestmentBuckets(
      [
        { id: 'funds', name: 'Fondos indexados' },
        { id: 'bitcoin', name: 'BTC' },
        { id: 'other', name: 'Oro' },
      ],
      4,
      (assetId, month) => values[assetId] + month,
    )

    expect(buckets).toEqual({ fundsValue: 124, cryptoValue: 84 })
  })

  it('aplica una única política de redondeo a dos decimales', () => {
    expect(round2(12.345)).toBe(12.35)
    expect(round2(undefined)).toBe(0)
  })

  it('resuelve variables CSS y conserva el fallback durante SSR', () => {
    expect(resolveCssColor('--accent', '#fff')).toBe('#fff')

    vi.stubGlobal('window', {})
    vi.stubGlobal('document', { documentElement: {} })
    vi.stubGlobal('getComputedStyle', () => ({
      getPropertyValue: (name: string) => (name === '--accent' ? ' #123456 ' : ''),
    }))

    expect(resolveCssColor('var(--accent)', '#fff')).toBe('#123456')
    expect(resolveCssColor('invalid', '#fff')).toBe('#fff')
  })

  it('crea respuestas JSON preservando estado y política de caché', async () => {
    const json = createJsonResponse('private, max-age=30')
    const response = json({ ok: true }, 201)

    expect(response.status).toBe(201)
    expect(response.headers.get('Content-Type')).toBe('application/json')
    expect(response.headers.get('Cache-Control')).toBe('private, max-age=30')
    expect(await response.json()).toEqual({ ok: true })
  })
})

describe('parseDecimal', () => {
  it('reads a decimal comma, with or without thousands dots', () => {
    expect(parseDecimal('64,32')).toBe(64.32)
    expect(parseDecimal('1.250,5')).toBe(1250.5)
  })

  it('reads a decimal point too', () => {
    expect(parseDecimal('123.45')).toBe(123.45)
  })

  it('is NaN for empty or non-numeric text', () => {
    expect(parseDecimal('')).toBeNaN()
    expect(parseDecimal('doce')).toBeNaN()
  })
})

describe('formatDecimalInput', () => {
  it('writes the amount with a decimal comma, ready to parse back', () => {
    expect(formatDecimalInput(64.32)).toBe('64,32')
    expect(parseDecimal(formatDecimalInput(1250.5))).toBe(1250.5)
  })
})
