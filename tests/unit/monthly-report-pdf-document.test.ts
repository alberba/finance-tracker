import { describe, expect, it } from 'vitest'

import {
  buildMonthlyReportDocument,
  REPORT_FONT_FILES,
  reportFileName,
} from '../../src/domain/monthly-report/pdf-document'
import {
  buildMonthlyReportViewModel,
  type MonthlyReportViewModel,
} from '../../src/domain/monthly-report/view-model'
import type { Entity, Transaction } from '../../src/scripts/types'

const accounts = [{ id: 'bbva', name: 'BBVA', openingBalance: 0 } as Entity]

function report(transactions: Transaction[], search = ''): MonthlyReportViewModel {
  return buildMonthlyReportViewModel({
    state: {
      currency: 'EUR',
      accounts,
      investmentAssets: [],
      liabilities: [],
      snapshots: {},
      transactions,
    },
    period: { from: '2026-09-01', to: '2026-09-30' },
    filters: { search, types: [], accountIds: [] },
    today: '2026-10-29',
  })
}

const movement = (id: string, type: Transaction['type'], amount: number): Transaction => ({
  id,
  date: '2026-09-10',
  month: 9,
  type,
  accountId: 'bbva',
  category: 'Niño',
  description: id,
  amount,
})

/** Every value of a given key anywhere in a document, for checks that do not care about layout. */
function collect(node: unknown, key: string, found: unknown[] = []): unknown[] {
  if (Array.isArray(node)) node.forEach((item) => collect(item, key, found))
  else if (node && typeof node === 'object') {
    Object.entries(node).forEach(([name, value]) => {
      if (name === key) found.push(value)
      collect(value, key, found)
    })
  }
  return found
}

function allText(node: unknown): string {
  return collect(node, 'text')
    .flat(Infinity)
    .map((item) => (typeof item === 'string' ? item : ''))
    .join('\n')
}

describe('buildMonthlyReportDocument', () => {
  const full = buildMonthlyReportDocument(
    report([
      movement('nomina', 'income', 2000),
      movement('super', 'expense', 150.5),
      movement('vwce', 'investment', 300),
    ]),
  )

  it('names the document after the period, so the file has a useful title', () => {
    expect(full.info?.title).toBe('Informe mensual 1 sept 2026 – 30 sept 2026')
  })

  it('only uses the fonts it embeds', () => {
    const fonts = new Set(collect(full, 'font'))
    fonts.add((full.defaultStyle as { font: string }).font)

    fonts.forEach((font) => expect(Object.keys(REPORT_FONT_FILES)).toContain(font))
  })

  it('repeats the header of every table and never splits a row', () => {
    const tables = collect(full, 'table') as Array<{ headerRows?: number; dontBreakRows?: boolean }>
    const ledgers = tables.filter((table) => table.headerRows)

    expect(ledgers.length).toBe(3)
    ledgers.forEach((table) => {
      expect(table.headerRows).toBe(1)
      expect(table.dontBreakRows).toBe(true)
    })
  })

  it('draws a bar for each expense category, as vector shapes with the amount beside it', () => {
    const canvases = collect(full, 'canvas')

    expect(canvases).toHaveLength(1)
    expect(allText(full)).toContain('150,50')
  })

  it('numbers the pages in the footer', () => {
    const footer = (full.footer as (page: number, count: number) => unknown)(2, 5)

    expect(allText(footer)).toContain('Página 2 de 5')
    expect(allText(footer)).toContain('Generado el 29 de octubre de 2026')
  })

  it('puts the position as of today and says no filter narrows it', () => {
    const text = allText(full)

    expect(text).toContain('Posición global actual (a 29 oct 2026)')
    expect(text).toContain('ningún filtro lo recorta')
  })

  it('lists the active filters under the title, and nothing when there are none', () => {
    const filtered = buildMonthlyReportDocument(report([movement('super', 'expense', 1)], 'super'))

    expect(allText(filtered)).toContain('Filtros: Búsqueda: «super»')
    expect(allText(full)).not.toContain('Filtros:')
  })

  it('says so, with zeros, when the period has no movements', () => {
    const empty = buildMonthlyReportDocument(report([]))

    expect(allText(empty)).toContain('No hay movimientos en este periodo.')
    expect(collect(empty, 'canvas')).toHaveLength(0)
  })

  it('keeps accents, ñ, € and the typographic minus in the text it writes', () => {
    const text = allText(full)

    expect(text).toContain('Niño')
    expect(text).toContain('€')
    expect(text).toContain('−150,50')
  })
})

describe('reportFileName', () => {
  it('is «Informe desde - hasta.pdf»', () => {
    expect(reportFileName('2026-09-25', '2026-10-24')).toBe('Informe 2026-09-25 - 2026-10-24.pdf')
  })
})
