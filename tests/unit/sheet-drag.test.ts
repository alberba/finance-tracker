import { describe, expect, it } from 'vitest'

import { dragOffset, releaseVelocity, shouldCloseSheet } from '../../src/neon/ui/sheet-drag'

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
