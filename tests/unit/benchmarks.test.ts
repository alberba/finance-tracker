import { describe, expect, it } from 'vitest'

import {
  BENCHMARKS,
  cumulativeReturn,
  sameMoneyInIndex,
} from '../../src/domain/investment/benchmarks'

describe('índices de referencia', () => {
  it('los ids y los símbolos no se repiten', () => {
    expect(new Set(BENCHMARKS.map((b) => b.id)).size).toBe(BENCHMARKS.length)
    expect(new Set(BENCHMARKS.map((b) => b.symbol)).size).toBe(BENCHMARKS.length)
  })
})

describe('sameMoneyInIndex', () => {
  it('sin puntos devuelve una serie vacía', () => {
    expect(sameMoneyInIndex([], [], [])).toEqual([])
    expect(sameMoneyInIndex([100], [100], [])).toEqual([])
  })

  it('con un solo punto devuelve el valor de apertura de la cartera', () => {
    expect(sameMoneyInIndex([1000], [1000], [50])).toEqual([1000])
  })

  it('hace crecer el índice por su variación y suma las aportaciones del mes', () => {
    const series = sameMoneyInIndex([1000, 1200, 1500], [1000, 1100, 1100], [100, 110, 99])
    // mes 1: 1000 * 1.1 + 100; mes 2: 1200 * 0.9 + 0
    expect(series[0]).toBe(1000)
    expect(series[1]).toBeCloseTo(1200)
    expect(series[2]).toBeCloseTo(1080)
  })

  it('devuelve las retiradas al cierre del mes', () => {
    const series = sameMoneyInIndex([1000, 800], [1000, 800], [100, 100])
    expect(series).toEqual([1000, 800])
  })

  it('no hace crecer el índice si el cierre anterior no es positivo', () => {
    const series = sameMoneyInIndex([1000, 1000, 1000], [1000, 1000, 1050], [0, 0, 130])
    expect(series).toEqual([1000, 1000, 1050])
  })

  it('se acorta al menor de los tres tamaños', () => {
    expect(sameMoneyInIndex([1, 2, 3, 4], [1, 1, 1, 1], [10, 10])).toHaveLength(2)
    expect(sameMoneyInIndex([1, 2], [1, 1, 1, 1], [10, 10, 10])).toHaveLength(2)
    expect(sameMoneyInIndex([1, 2, 3], [1], [10, 10, 10])).toHaveLength(1)
  })
})

describe('cumulativeReturn', () => {
  it('expresa la rentabilidad acumulada desde el primer cierre en porcentaje', () => {
    const result = cumulativeReturn([200, 220, 180])
    expect(result[0]).toBe(0)
    expect(result[1]).toBeCloseTo(10)
    expect(result[2]).toBeCloseTo(-10)
  })

  it('devuelve vacío si no hay cierres o el primero no es positivo', () => {
    expect(cumulativeReturn([])).toEqual([])
    expect(cumulativeReturn([0, 10])).toEqual([])
    expect(cumulativeReturn([-5, 10])).toEqual([])
  })
})
