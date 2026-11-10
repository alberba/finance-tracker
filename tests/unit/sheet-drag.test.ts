import { describe, expect, it } from 'vitest'

import {
  dragOffset,
  listSheetGesture,
  releaseVelocity,
  shouldCloseSheet,
} from '../../src/neon/ui/sheet-drag'

describe('reglas de arrastre de la hoja', () => {
  it('hacia abajo sigue al dedo y hacia arriba cede cada vez menos', () => {
    expect(dragOffset(80)).toBe(80)
    expect(dragOffset(0)).toBe(0)
    const small = Math.abs(dragOffset(-100))
    const large = Math.abs(dragOffset(-400))
    expect(dragOffset(-100)).toBeLessThan(0)
    expect(small).toBe(40)
    expect(large).toBe(80)
    expect(large / small).toBeLessThan(4)
  })

  it('cierra pasando el 30 % del alto', () => {
    expect(shouldCloseSheet(121, 400, 0)).toBe(true)
    expect(shouldCloseSheet(119, 400, 0)).toBe(false)
  })

  it('cierra con un tirón de más de 0,11 px/ms aunque recorra poco', () => {
    expect(shouldCloseSheet(10, 400, 0.12)).toBe(true)
    expect(shouldCloseSheet(10, 400, 0.1)).toBe(false)
  })

  it('no cierra si no se ha movido hacia abajo', () => {
    expect(shouldCloseSheet(0, 400, 5)).toBe(false)
    expect(shouldCloseSheet(-20, 400, 5)).toBe(false)
  })

  it('calcula la velocidad entre dos muestras y es 0 sin tiempo transcurrido', () => {
    expect(releaseVelocity({ y: 100, at: 0 }, { y: 150, at: 250 })).toBe(0.2)
    expect(releaseVelocity({ y: 100, at: 10 }, { y: 150, at: 10 })).toBe(0)
  })
})

describe('gesto de la hoja con lista', () => {
  it('un toque la alterna, esté como esté', () => {
    expect(listSheetGesture(false, -3, 0)).toBe('toggle')
    expect(listSheetGesture(true, 4, 0)).toBe('toggle')
  })

  it('arrastrar hacia arriba la abre del todo, pasados 48 px o con un tirón', () => {
    expect(listSheetGesture(false, -60, 0)).toBe('expand')
    expect(listSheetGesture(false, -20, -0.2)).toBe('expand')
    expect(listSheetGesture(false, -20, -0.05)).toBe('stay')
  })

  it('arrastrar hacia abajo la devuelve, pasados 48 px o con un tirón', () => {
    expect(listSheetGesture(true, 60, 0)).toBe('collapse')
    expect(listSheetGesture(true, 20, 0.2)).toBe('collapse')
    expect(listSheetGesture(true, 20, 0.05)).toBe('stay')
  })

  it('arrastrar en el sentido que ya no puede ir no hace nada', () => {
    expect(listSheetGesture(true, -80, -0.5)).toBe('stay')
    expect(listSheetGesture(false, 80, 0.5)).toBe('stay')
  })
})
