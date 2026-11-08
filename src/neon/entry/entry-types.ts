import type { TransactionType } from '../../scripts/types'

/** The movement types in the order the entry sheet offers them (DESIGN.md, Segmentado). */
export const ENTRY_TYPES: ReadonlyArray<{ value: TransactionType; label: string }> = [
  { value: 'expense', label: 'Gasto' },
  { value: 'income', label: 'Ingreso' },
  { value: 'saving', label: 'Ahorro' },
  { value: 'investment', label: 'Inversión' },
]
