import { describe, expect, it } from 'vitest'

import { sharedScale, spreadLabels } from '../../src/neon/dashboard/mobile-chart'

describe('sharedScale', () => {
  it('no dibuja nada sin valores ni referencia', () => {
    expect(sharedScale([], 5)).toEqual({ lines: [], baseTop: null })
    expect(sharedScale([{ values: [] }], 5)).toEqual({ lines: [], baseTop: null })
  })

  it('reparte los puntos en x y deja el 8 % libre arriba y abajo', () => {
    const { lines, baseTop } = sharedScale([{ values: [0, 50, 100] }], 3)
    expect(lines).toHaveLength(1)
    expect(lines[0].points).toEqual([
      { x: 0, top: 93.1 },
      { x: 50, top: 50 },
      { x: 100, top: 6.9 },
    ])
    expect(baseTop).toBeNull()
  })

  it('comparte la escala entre series y conserva el trazo discontinuo', () => {
    const { lines } = sharedScale([{ values: [0, 100] }, { values: [50, 50], dashed: true }], 2)
    expect(lines[0].dashed).toBeUndefined()
    expect(lines[1].dashed).toBe(true)
    expect(lines[1].points.map((point) => point.top)).toEqual([50, 50])
  })

  it('una serie puede parar antes del último hueco', () => {
    const { lines } = sharedScale([{ values: [10, 20] }], 5)
    expect(lines[0].points.map((point) => point.x)).toEqual([0, 25])
  })

  it('mantiene la base dentro del rango y devuelve su altura', () => {
    const { lines, baseTop } = sharedScale([{ values: [100, 200] }], 2, 0)
    expect(baseTop).toBe(93.1)
    expect(lines[0].points[0].top).toBeLessThan(baseTop as number)
  })

  it('la base sola ya dibuja el rango', () => {
    expect(sharedScale([], 3, 40)).toEqual({ lines: [], baseTop: 50 })
  })

  it('un valor constante usa una amplitud propia para no dividir entre cero', () => {
    const { lines } = sharedScale([{ values: [200, 200] }], 2)
    expect(lines[0].points.map((point) => point.top)).toEqual([50, 50])
    const zero = sharedScale([{ values: [0, 0] }], 2)
    expect(zero.lines[0].points.map((point) => point.top)).toEqual([50, 50])
  })

  it('con un solo hueco el punto queda a la izquierda', () => {
    const { lines } = sharedScale([{ values: [5] }], 1)
    expect(lines[0].points[0].x).toBe(0)
  })
})

describe('spreadLabels', () => {
  it('con cuatro huecos o menos los rotula todos', () => {
    expect(spreadLabels(0)).toEqual([])
    expect(spreadLabels(1)).toEqual([0])
    expect(spreadLabels(4)).toEqual([0, 1, 2, 3])
  })

  it('con más reparte cuatro etiquetas con el primero y el último', () => {
    expect(spreadLabels(5)).toEqual([0, 1, 3, 4])
    expect(spreadLabels(31)).toEqual([0, 10, 20, 30])
  })
})
