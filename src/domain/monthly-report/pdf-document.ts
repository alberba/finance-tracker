import type {
  Content,
  ContentTable,
  ContentText,
  TableCell,
  TDocumentDefinitions,
} from 'pdfmake/interfaces'

import { formatMoney, formatPercent, formatShortDate, formatSignedMoney } from '../../lib/format'
import type { TransactionType } from '../../scripts/types'
import type {
  MonthlyReportCategoryRow,
  MonthlyReportMovementRow,
  MonthlyReportViewModel,
} from './view-model'

/**
 * The site fonts, as the PDF names them. Each style maps to a file under
 * `assets/fonts/report` that the generator loads when the report is downloaded.
 */
export const REPORT_FONT_FILES = {
  Syne: { normal: 'Syne-SemiBold.ttf', bold: 'Syne-Bold.ttf' },
  DMSans: { normal: 'DMSans-Regular.ttf', bold: 'DMSans-Bold.ttf' },
  DMSansMedium: { normal: 'DMSans-Medium.ttf', bold: 'DMSans-Bold.ttf' },
  DMMono: { normal: 'DMMono-Regular.ttf', bold: 'DMMono-Regular.ttf' },
} as const

/** The light theme's tokens (`global.css`): the PDF is read on paper, whatever the app's theme. */
const INK = '#0d1626'
const MUTED = '#5a6678'
const LINE = '#e4e8f1'
const LINE_STRONG = '#ccd4e1'
const BAR = '#5a6678'
const BAR_TRACK = '#e4e8f1'

const PAGE_MARGINS: [number, number, number, number] = [40, 56, 40, 56]
const BAR_WIDTH = 96
const BAR_HEIGHT = 6

const TYPE_NAME: Record<TransactionType, string> = {
  income: 'Ingreso',
  expense: 'Gasto',
  saving: 'Ahorro',
  investment: 'Inversión',
}

/** Digits in the display face with fixed width, so amounts line up in a column. */
const FIGURE = { font: 'Syne', fontFeatures: ['tnum' as const] }

function kicker(text: string): ContentText {
  return {
    text: text.toUpperCase(),
    font: 'DMMono',
    fontSize: 7.5,
    color: MUTED,
    characterSpacing: 1,
  }
}

function heading(number: string, title: string): Content {
  return {
    stack: [
      {
        text: [
          { text: `${number}  `, font: 'DMMono', color: MUTED, fontSize: 8 },
          { text: title, font: 'Syne', bold: true, fontSize: 13 },
        ],
      },
    ],
    margin: [0, 18, 0, 6],
    // Keep a heading with the table it introduces.
    keepWithNext: true,
  } as Content
}

function th(text: string, alignment: 'left' | 'right' = 'left'): TableCell {
  return {
    text: text.toUpperCase(),
    font: 'DMSansMedium',
    fontSize: 7,
    color: MUTED,
    characterSpacing: 0.6,
    alignment,
    margin: [0, 2, 0, 2],
  }
}

function td(text: string, alignment: 'left' | 'right' = 'left', extra: object = {}): TableCell {
  return { text, alignment, margin: [0, 3, 0, 3], ...extra }
}

function amountCell(text: string): TableCell {
  return td(text, 'right', FIGURE)
}

/** Hairlines between rows, none at the sides: the ledger look of the app's tables. */
const LEDGER_LAYOUT = {
  hLineWidth: (index: number, node: { table: { body: unknown[] } }) =>
    index === 0 ? 0 : index === 1 || index === node.table.body.length ? 0.8 : 0.4,
  hLineColor: (index: number) => (index === 1 ? LINE_STRONG : LINE),
  vLineWidth: () => 0,
  paddingLeft: () => 0,
  paddingRight: () => 6,
}

function ledger(table: ContentTable['table']): ContentTable {
  return { table: { ...table, headerRows: 1, dontBreakRows: true }, layout: LEDGER_LAYOUT }
}

function bar(amount: number, max: number): TableCell {
  const width = max > 0 ? Math.max(1, (amount / max) * BAR_WIDTH) : 0
  return {
    canvas: [
      { type: 'rect', x: 0, y: 0, w: BAR_WIDTH, h: BAR_HEIGHT, color: BAR_TRACK },
      { type: 'rect', x: 0, y: 0, w: width, h: BAR_HEIGHT, color: BAR },
    ],
    margin: [0, 5, 0, 0],
  }
}

function categoryTable(
  rows: MonthlyReportCategoryRow[],
  currency: string,
  withBars: boolean,
): Content {
  const max = Math.max(0, ...rows.map((row) => row.amount))
  const head: TableCell[] = [th('Categoría'), th('Mov.', 'right')]
  if (withBars) head.push(th(''))
  head.push(th('Importe', 'right'), th('%', 'right'))
  const body: TableCell[][] = rows.map((row) => {
    const cells: TableCell[] = [td(row.category), td(String(row.count), 'right', FIGURE)]
    if (withBars) cells.push(bar(row.amount, max))
    cells.push(
      amountCell(formatMoney(row.amount, currency)),
      amountCell(formatPercent(row.share, { digits: 1 })),
    )
    return cells
  })
  const widths = withBars ? ['*', 28, BAR_WIDTH, 70, 44] : ['*', 28, 70, 44]
  return ledger({ widths, body: [head, ...body] })
}

function movementAmount(row: MonthlyReportMovementRow, currency: string): string {
  if (row.direction === 'none') return formatMoney(row.amount, currency)
  return formatSignedMoney(row.direction === 'in' ? row.amount : -row.amount, currency)
}

function movementsTable(rows: MonthlyReportMovementRow[], currency: string): Content {
  const head: TableCell[] = [
    th('Fecha'),
    th('Descripción'),
    th('Categoría'),
    th('Cuenta'),
    th('Tipo'),
    th('Importe', 'right'),
  ]
  const body: TableCell[][] = rows.map((row) => [
    td(formatShortDate(row.date)),
    td(row.description),
    td(row.category),
    td(row.account),
    td(TYPE_NAME[row.type]),
    amountCell(movementAmount(row, currency)),
  ])
  return ledger({ widths: [62, '*', 66, 62, 44, 62], body: [head, ...body] })
}

function figure(label: string, value: string): Content {
  return {
    stack: [
      {
        text: label.toUpperCase(),
        font: 'DMSansMedium',
        fontSize: 7,
        color: MUTED,
        characterSpacing: 0.6,
      },
      { text: value, ...FIGURE, bold: true, fontSize: 15, margin: [0, 3, 0, 0] },
    ],
  }
}

function figureStrip(figures: Array<[string, string]>): Content {
  return {
    table: {
      widths: figures.map(() => '*'),
      body: [figures.map(([label, value]) => figure(label, value))],
    },
    layout: {
      hLineWidth: (index: number) => (index === 0 ? 0.8 : 0.4),
      hLineColor: () => LINE_STRONG,
      vLineWidth: (index: number) => (index === 0 ? 0 : 0.4),
      vLineColor: () => LINE,
      paddingTop: () => 8,
      paddingBottom: () => 8,
      paddingLeft: (index: number) => (index === 0 ? 0 : 10),
    },
  }
}

/** The report as a pdfmake document, in the app's language: Syne for titles and figures. */
export function buildMonthlyReportDocument(report: MonthlyReportViewModel): TDocumentDefinitions {
  const { currency } = report
  const content: Content[] = [
    kicker('Informe mensual'),
    { text: report.periodLabel, font: 'Syne', bold: true, fontSize: 22, margin: [0, 4, 0, 2] },
  ]
  if (report.appliedFilters.length) {
    content.push({
      text: `Filtros: ${report.appliedFilters.join(' · ')}`,
      color: MUTED,
      fontSize: 8.5,
      margin: [0, 2, 0, 0],
    })
  }

  content.push(
    heading('01', 'Resumen'),
    figureStrip([
      ['Ingresos', formatMoney(report.summary.income, currency)],
      ['Gastos', formatMoney(report.summary.expense, currency)],
      ['Neto', formatSignedMoney(report.summary.net, currency)],
    ]),
    {
      text: `Ahorro ${formatMoney(report.summary.saving, currency)} · Inversión ${formatMoney(report.summary.investment, currency)}. El neto son los ingresos menos los gastos; el ahorro y la inversión mueven dinero y no lo restan.`,
      color: MUTED,
      fontSize: 8,
      margin: [0, 6, 0, 0],
    },
  )

  if (report.hasMovements) {
    content.push(heading('02', 'Gastos por categoría'))
    content.push(
      report.expenseCategories.length
        ? categoryTable(report.expenseCategories, currency, true)
        : { text: 'Sin gastos en el periodo.', color: MUTED },
    )
    content.push(heading('03', 'Ingresos por categoría'))
    content.push(
      report.incomeCategories.length
        ? categoryTable(report.incomeCategories, currency, false)
        : { text: 'Sin ingresos en el periodo.', color: MUTED },
    )
    content.push(heading('04', 'Últimos movimientos'))
    content.push(movementsTable(report.movements, currency))
    if (report.movementsNote) {
      content.push({ text: report.movementsNote, color: MUTED, fontSize: 8, margin: [0, 4, 0, 0] })
    }
  } else {
    content.push(heading('02', 'Movimientos'), {
      text: 'No hay movimientos en este periodo.',
      color: MUTED,
    })
  }

  const position = report.position
  content.push(
    heading('05', `Posición global actual (a ${formatShortDate(position.asOf)})`),
    figureStrip([
      ['Efectivo', formatMoney(position.cash, currency)],
      ['Inversión', formatMoney(position.investment, currency)],
      ['Pasivos', formatMoney(position.liabilities, currency)],
      ['Patrimonio neto', formatMoney(position.net, currency)],
    ]),
    {
      text: 'Es el patrimonio total a fecha de hoy, no el cierre del periodo, y ningún filtro lo recorta.',
      color: MUTED,
      fontSize: 8,
      margin: [0, 6, 0, 0],
    },
  )

  return {
    pageSize: 'A4',
    pageMargins: PAGE_MARGINS,
    info: {
      title: `Informe mensual ${report.periodLabel}`,
      subject: 'Informe mensual de movimientos',
    },
    defaultStyle: { font: 'DMSans', fontSize: 9, color: INK, lineHeight: 1.15 },
    footer: (currentPage: number, pageCount: number): Content => ({
      columnGap: 16,
      columns: [
        {
          text: `Generado el ${report.generatedLabel} · ${currency} · Periodo por fecha del movimiento`,
          color: MUTED,
          fontSize: 7.5,
          width: '*',
        },
        {
          text: `Página ${currentPage} de ${pageCount}`,
          width: 'auto',
          alignment: 'right',
          color: MUTED,
          fontSize: 7.5,
        },
      ],
      margin: [PAGE_MARGINS[0], 20, PAGE_MARGINS[2], 0],
    }),
    content,
  }
}

/** The file name a downloaded report gets. */
export function reportFileName(from: string, to: string): string {
  return `Informe ${from} - ${to}.pdf`
}
