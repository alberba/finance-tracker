import { describe, expect, it } from 'vitest'

import {
  formatAxisLabel,
  formatCompactMoney,
  formatDayMonth,
  formatDecimal,
  formatDueLabel,
  formatLongDate,
  formatMoney,
  formatMonthName,
  formatMonthYear,
  formatNumber,
  formatPercent,
  formatQuotePrice,
  formatShortDate,
  formatSignedMoney,
  formatStamp,
  formatTime,
  formatWeekdayDate,
  formatWholeAmount,
  MINUS,
  splitDecimals,
} from '../../src/lib/format'
import type { Month } from '../../src/lib/month'

const NBSP = ' '

describe('formatMoney', () => {
  it('formatea en es-ES con dos decimales y el símbolo al final', () => {
    expect(formatMoney(15850)).toBe(`15.850,00${NBSP}€`)
    expect(formatMoney(3.5)).toBe(`3,50${NBSP}€`)
  })

  it('agrupa siempre los miles, también con cuatro cifras', () => {
    expect(formatMoney(1234.5)).toBe(`1.234,50${NBSP}€`)
  })

  it('marca las pérdidas con el menos tipográfico', () => {
    expect(formatMoney(-1234.5)).toBe(`${MINUS}1.234,50${NBSP}€`)
  })

  it('no muestra −0 cuando el redondeo deja cero', () => {
    expect(formatMoney(-0.001)).toBe(`0,00${NBSP}€`)
  })

  it('usa la moneda que se le pasa', () => {
    expect(formatMoney(12, 'USD')).toBe(`12,00${NBSP}US$`)
  })

  it('trata lo que no es número como cero', () => {
    expect(formatMoney(undefined)).toBe(`0,00${NBSP}€`)
    expect(formatMoney('abc')).toBe(`0,00${NBSP}€`)
  })

  it('cae a un formato plano si la moneda no es válida', () => {
    expect(formatMoney(1234, 'XX')).toBe('1.234,00 XX')
  })
})

describe('formatCompactMoney', () => {
  it('abrevia miles y millones para los ejes', () => {
    expect(formatCompactMoney(1234)).toBe(`1,2${NBSP}mil${NBSP}€`)
    expect(formatCompactMoney(2_500_000)).toBe(`2,5${NBSP}M${NBSP}€`)
    expect(formatCompactMoney(950)).toBe(`950${NBSP}€`)
  })

  it('marca las pérdidas con el menos tipográfico', () => {
    expect(formatCompactMoney(-12_500)).toBe(`${MINUS}12,5${NBSP}mil${NBSP}€`)
  })
})

describe('formatNumber', () => {
  it('da los decimales pedidos y agrupa siempre los miles', () => {
    expect(formatNumber(1234)).toBe('1.234')
    expect(formatNumber(102.5, 4)).toBe('102,5000')
  })

  it('marca los negativos con el menos tipográfico', () => {
    expect(formatNumber(-1234.5, 1)).toBe(`${MINUS}1.234,5`)
  })
})

describe('formatDecimal', () => {
  it('quita los ceros sobrantes y conserva hasta ocho decimales de un número', () => {
    expect(formatDecimal(1250)).toBe('1.250')
    expect(formatDecimal(0.123456789)).toBe('0,12345679')
  })

  it('conserva todos los dígitos de una cadena decimal', () => {
    expect(formatDecimal('0.01789334395')).toBe('0,01789334395')
    expect(formatDecimal('12345678901.123456789')).toBe('12.345.678.901,123456789')
    expect(formatDecimal('0.10000000')).toBe('0,1')
  })

  it('rellena hasta los decimales mínimos', () => {
    expect(formatDecimal('100', { minDigits: 2 })).toBe('100,00')
    expect(formatDecimal('0.00123', { minDigits: 2 })).toBe('0,00123')
  })

  it('marca los negativos con el menos tipográfico', () => {
    expect(formatDecimal('-1234.5')).toBe(`${MINUS}1.234,5`)
  })
})

describe('formatQuotePrice', () => {
  it('conserva hasta seis decimales en la moneda de la cotización', () => {
    expect(formatQuotePrice(0.000123, 'EUR')).toBe(`0,000123${NBSP}€`)
    expect(formatQuotePrice(58412, 'EUR')).toBe(`58.412,00${NBSP}€`)
    expect(formatQuotePrice(1234, 'EUR')).toBe(`1.234,00${NBSP}€`)
  })

  it('cae a un formato plano si la moneda no es válida', () => {
    expect(formatQuotePrice(1.5, 'XX')).toBe('1,50 XX')
  })
})

describe('formatSignedMoney', () => {
  it('antepone + a las ganancias y el menos tipográfico a las pérdidas', () => {
    expect(formatSignedMoney(374.59)).toBe(`+374,59${NBSP}€`)
    expect(formatSignedMoney(-12)).toBe(`${MINUS}12,00${NBSP}€`)
    expect(formatSignedMoney(-1234.5)).toBe(`${MINUS}1.234,50${NBSP}€`)
  })

  it('deja el cero sin signo', () => {
    expect(formatSignedMoney(0)).toBe(`0,00${NBSP}€`)
  })
})

describe('formatPercent', () => {
  it('usa coma decimal y espacio fino antes del símbolo', () => {
    expect(formatPercent(3.5)).toBe(`3,50${NBSP}%`)
    expect(formatPercent(43.456, { digits: 1 })).toBe(`43,5${NBSP}%`)
    expect(formatPercent(1234.5)).toBe(`1.234,50${NBSP}%`)
  })

  it('con signo, marca ganancias con + y pérdidas con −', () => {
    expect(formatPercent(3.5, { signed: true })).toBe(`+3,50${NBSP}%`)
    expect(formatPercent(-31.47, { signed: true })).toBe(`${MINUS}31,47${NBSP}%`)
    expect(formatPercent(0, { signed: true })).toBe(`0,00${NBSP}%`)
  })

  it('sin signo, las pérdidas llevan igualmente el menos tipográfico', () => {
    expect(formatPercent(-1.2)).toBe(`${MINUS}1,20${NBSP}%`)
  })

  it('no muestra −0 cuando el redondeo deja cero', () => {
    expect(formatPercent(-0.001, { signed: true })).toBe(`0,00${NBSP}%`)
  })
})

describe('splitDecimals', () => {
  it('separa la parte entera de los decimales y la moneda', () => {
    expect(splitDecimals(`11.062,68${NBSP}€`)).toEqual({ whole: '11.062', rest: `,68${NBSP}€` })
  })

  it('devuelve todo como parte entera si no hay decimales', () => {
    expect(splitDecimals('—')).toEqual({ whole: '—', rest: '' })
  })
})

describe('fechas', () => {
  it('formatShortDate da día, mes abreviado y año', () => {
    expect(formatShortDate('2026-07-15')).toBe('15 jul 2026')
  })

  it('formatLongDate da la fecha completa', () => {
    expect(formatLongDate('2026-07-31')).toBe('31 de julio de 2026')
  })

  it('formatStamp da día/mes y hora de un instante', () => {
    expect(formatStamp('2026-09-26T08:42:00Z', 'Europe/Madrid')).toBe('26/09, 10:42')
  })

  it('formatTime da solo la hora de un instante', () => {
    expect(formatTime('2026-09-26T07:05:00Z', 'Europe/Madrid')).toBe('09:05')
  })

  it('devuelve una raya para fechas vacías o inválidas', () => {
    expect(formatShortDate('')).toBe('—')
    expect(formatLongDate('no-date')).toBe('—')
    expect(formatStamp('')).toBe('—')
    expect(formatTime('')).toBe('—')
  })
})

describe('formatDayMonth', () => {
  it('da el día y el mes abreviado, sin año', () => {
    expect(formatDayMonth('2026-09-27')).toBe('27 sept')
  })

  it('marca la falta de fecha con una raya', () => {
    expect(formatDayMonth('')).toBe('—')
  })
})

describe('formatMonthName', () => {
  it('da el mes con mayúscula inicial, sin año', () => {
    expect(formatMonthName(9)).toBe('Septiembre')
  })

  it('devuelve una cadena vacía si el mes no existe', () => {
    // `Month` solo admite 1-12; el cast mantiene cubierta la guarda de runtime.
    expect(formatMonthName(13 as Month)).toBe('')
  })
})

describe('formatMonthYear', () => {
  it('da el mes con mayúscula inicial y el año', () => {
    expect(formatMonthYear(7, 2026)).toBe('Julio 2026')
    expect(formatMonthYear(1, 2025)).toBe('Enero 2025')
  })

  it('devuelve solo el año si el mes no existe', () => {
    expect(formatMonthYear(13 as Month, 2026)).toBe('2026')
  })
})

describe('formatAxisLabel', () => {
  it('abrevia los nombres de mes a tres letras', () => {
    expect(formatAxisLabel('ENERO')).toBe('ENE')
    expect(formatAxisLabel('Septiembre')).toBe('Sep')
  })

  it('no corta etiquetas de fecha', () => {
    expect(formatAxisLabel('01/01')).toBe('01/01')
    expect(formatAxisLabel('28/02')).toBe('28/02')
  })

  it('devuelve cadena vacía para etiquetas ausentes', () => {
    expect(formatAxisLabel(undefined)).toBe('')
  })
})

describe('formatWeekdayDate', () => {
  it('names the weekday and the month, capitalized', () => {
    expect(formatWeekdayDate('2026-09-28')).toBe('Lunes, 28 de septiembre')
  })

  it('falls back to the missing mark', () => {
    expect(formatWeekdayDate('')).toBe('—')
  })
})

describe('formatDueLabel', () => {
  it.each([
    ['2026-09-28', 'Vence hoy'],
    ['2026-09-29', 'Vence mañana'],
    ['2026-10-02', 'En 4 días'],
    ['2026-09-27', 'Hace 1 día'],
    ['2026-09-20', 'Hace 8 días'],
  ])('reads %s from 28 September as "%s"', (date, label) => {
    expect(formatDueLabel(date, '2026-09-28')).toBe(label)
  })
})

describe('formatWholeAmount', () => {
  it('rounds to euros and always groups thousands', () => {
    expect(formatWholeAmount(1249.5)).toBe('1.250')
    expect(formatWholeAmount(18420.4)).toBe('18.420')
    expect(formatWholeAmount(80)).toBe('80')
  })

  it('uses the typographic minus', () => {
    expect(formatWholeAmount(-1500.2)).toBe('−1.500')
    expect(formatWholeAmount(-0.4)).toBe('0')
  })
})
