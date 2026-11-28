import { formatDayMonth, formatDecimal, formatMoney } from '../../../lib/format'
import { round2 } from '../../../lib/number'
import type { Transaction } from '../../../scripts/types'

// The movements of an asset or an instrument as the detail lists them: by year,
// newest first, each as a row already formatted. Shared by both details.

export interface AssetMovementRow {
  id: string
  /** «15 feb». */
  day: string
  side: 'buy' | 'sell' | null
  /** «Compra», «Venta» or, for a movement without operation, its description. */
  operation: string
  fee: string
  /** A fee was charged: «Sin comisión» is not worth a line of its own. */
  feeCharged: boolean
  /** «10 × 120,00 €». */
  quantity: string
  total: string
}

export interface AssetYear {
  year: string
  /** «Comprado 2.200,00 € · Vendido +300,00 €». */
  sum: string
  rows: AssetMovementRow[]
}

export function isOperation(tx: Transaction): boolean {
  return !!tx.side && Number(tx.units) > 0
}

/** Newest first: by date, then by time. */
export function newestFirst(a: Transaction, b: Transaction): number {
  return b.date.localeCompare(a.date) || String(b.time ?? '').localeCompare(String(a.time ?? ''))
}

function movementRow(tx: Transaction): AssetMovementRow {
  const operation = isOperation(tx)
  const sell = tx.side === 'sell'
  const amount = Math.abs(Number(tx.amount) || 0)
  const fee = Number(tx.fee) || 0
  const units = Number(tx.units)
  const title = operation ? (sell ? 'Venta' : 'Compra') : tx.description || 'Movimiento'
  const total = sell ? `+${formatMoney(amount)}` : formatMoney(amount)
  const day = formatDayMonth(tx.date)
  return {
    id: tx.id,
    day,
    side: operation ? (sell ? 'sell' : 'buy') : null,
    operation: title,
    fee: operation ? (fee > 0 ? `Comisión ${formatMoney(fee)}` : 'Sin comisión') : '',
    feeCharged: operation && fee > 0,
    quantity: operation
      ? `${formatDecimal(units)} × ${formatMoney(Number(tx.unitPrice) || 0)}`
      : '',
    total,
  }
}

function yearSum(movements: readonly Transaction[]): string {
  let bought = 0
  let sold = 0
  for (const tx of movements) {
    const amount = Math.abs(Number(tx.amount) || 0)
    if (tx.side === 'sell') sold += amount
    else bought += amount
  }
  return [
    bought > 0 ? `Comprado ${formatMoney(round2(bought))}` : '',
    sold > 0 ? `Vendido +${formatMoney(round2(sold))}` : '',
  ]
    .filter(Boolean)
    .join(' · ')
}

export function groupByYear(movements: readonly Transaction[]): AssetYear[] {
  const years: Array<{ year: string; movements: Transaction[] }> = []
  for (const tx of movements) {
    const year = tx.date.slice(0, 4)
    const last = years.at(-1)
    if (last?.year === year) last.movements.push(tx)
    else years.push({ year, movements: [tx] })
  }
  return years.map(({ year, movements: group }) => ({
    year,
    sum: yearSum(group),
    rows: group.map(movementRow),
  }))
}
