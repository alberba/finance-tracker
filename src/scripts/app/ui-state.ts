import type {
  TransactionsSubTab,
  SectionId,
  SortDirection,
  TxSortColumn,
} from '../types'
import type { Month } from '../../lib/month'
import type { RegistryFilters } from '../../domain/transactions/registry'

export interface UiState {
  activeSection: SectionId
  /** Year the Movimientos registry shows. */
  txYear: number
  /** Month of that year the ink band shows. */
  txFilterMonth: Month
  txSort: {
    column: TxSortColumn
    direction: SortDirection
  }
  txSelectedIds: string[]
  txFilters: RegistryFilters
  txTab: TransactionsSubTab
  snapshotMonth: Month
  investmentMonth: Month
  investmentReturnMode: 'simple' | 'twr'
}
