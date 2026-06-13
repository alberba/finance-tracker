import type { State, Transaction } from '../../scripts/types'

export interface DataSummaryViewModel {
  totalTransactions: number
  totalSnapshots: number
  totalContributions: number
  meta: string
}

const CSV_HEADER = [
  'id',
  'date',
  'month',
  'type',
  'accountId',
  'category',
  'description',
  'amount',
  'time',
  'symbol',
  'side',
  'unitPrice',
  'units',
  'fee',
  'movementCurrency',
  'declared',
] as const

type CsvField = string | number | undefined

export function buildDataSummaryViewModel(state: State): DataSummaryViewModel {
  const source = state.meta?.source || 'desconocido'
  const generated = state.meta?.generatedAt || ''
  const savedAt = state.meta?.savedAt || ''

  return {
    totalTransactions: state.transactions.length,
    totalSnapshots: Object.keys(state.snapshots || {}).length,
    totalContributions: state.contributions.length,
    meta: `Origen: ${source} | Seed: ${generated} | Último guardado local: ${savedAt || '-'}`,
  }
}

export function buildTransactionsCsv(state: State): string {
  const rows = state.transactions.map((item: Transaction) => [
    item.id,
    item.date,
    item.month,
    item.type,
    item.accountId,
    item.category,
    item.description,
    item.amount,
    item.time || '',
    item.symbol || '',
    item.side || '',
    Number.isFinite(item.unitPrice) ? item.unitPrice : '',
    Number.isFinite(item.units) ? item.units : '',
    Number.isFinite(item.fee) ? item.fee : '',
    item.movementCurrency || '',
    item.declared ? 'true' : 'false',
  ])

  return [CSV_HEADER as readonly CsvField[], ...rows]
    .map((row) =>
      row.map((field) => `"${String(field ?? '').replace(/"/g, '""')}"`).join(','),
    )
    .join('\n')
}
