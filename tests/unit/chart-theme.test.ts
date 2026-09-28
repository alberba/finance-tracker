import { describe, expect, it } from 'vitest'

import {
  CHART_SERIES_COUNT,
  readChartTheme,
  resolveColor,
  seriesColor,
} from '../../src/scripts/chart-theme'

const tokens: Record<string, string> = {
  '--chart-axis': '#7c8798',
  '--chart-grid': '#e9edf4',
  '--chart-legend': '#5a6678',
  '--chart-point-border': '#ffffff',
  '--chart-empty': '#e4e8f1',
  '--font-display': "'Syne', sans-serif",
  '--chart-series-1': '#0d8476',
  '--chart-series-2': '#d49a1f',
}
const read = (name: string) => tokens[name] ?? ''

describe('readChartTheme', () => {
  it('lee ejes, rejilla, leyenda y tipografía de los tokens', () => {
    expect(readChartTheme(read)).toEqual({
      axis: '#7c8798',
      grid: '#e9edf4',
      legend: '#5a6678',
      pointBorder: '#ffffff',
      empty: '#e4e8f1',
      fontFamily: "'Syne', sans-serif",
    })
  })

  it('usa valores de reserva si un token no está definido', () => {
    const theme = readChartTheme(() => '')

    expect(theme.axis).toMatch(/^#/)
    expect(theme.fontFamily).toContain('Syne')
  })
})

describe('seriesColor', () => {
  it('apunta a los tokens de la paleta de series y da la vuelta al acabarse', () => {
    expect(seriesColor(0)).toBe('var(--chart-series-1)')
    expect(seriesColor(1)).toBe('var(--chart-series-2)')
    expect(seriesColor(CHART_SERIES_COUNT)).toBe('var(--chart-series-1)')
  })
})

describe('resolveColor', () => {
  it('resuelve una referencia a token con su valor actual', () => {
    expect(resolveColor('var(--chart-series-2)', read)).toBe('#d49a1f')
  })

  it('deja pasar los colores literales', () => {
    expect(resolveColor('#3b6bf0', read)).toBe('#3b6bf0')
  })

  it('devuelve un gris neutro si el token no existe', () => {
    expect(resolveColor('var(--nope)', read)).toBe('#8693a4')
  })
})
