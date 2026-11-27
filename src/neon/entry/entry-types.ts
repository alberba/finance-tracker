import type { TransactionType } from '../../scripts/types'

/** The movement types in the order the entry sheet offers them (DESIGN.md, Segmentado). */
export const ENTRY_TYPES: ReadonlyArray<{ value: TransactionType; label: string }> = [
  { value: 'expense', label: 'Gasto' },
  { value: 'income', label: 'Ingreso' },
  { value: 'saving', label: 'Ahorro' },
  { value: 'investment', label: 'Inversión' },
]

/** The account icon of the entry pickers. */
export const ACCOUNT_ICON =
  'M4 6h14a2 2 0 0 1 2 2v2M4 6a1 1 0 0 0-1 1v11a2 2 0 0 0 2 2h13a2 2 0 0 0 2-2v-2M4 6l12-3 1 3M16 10h5v6h-5a3 3 0 0 1 0-6ZM16 13h.01'

/** A text field of the entry sheet, and its label. */
export const ENTRY_FIELD_CLASS =
  'min-w-0 bg-panel border-ctrl-line text-text outline-accent rounded-field min-h-[46px] w-full border px-3.5 text-[16px] font-bold focus-visible:outline-2 focus-visible:outline-offset-2'
export const ENTRY_LABEL_CLASS = 'text-muted grid min-w-0 gap-1.5 text-[13px] font-bold'
