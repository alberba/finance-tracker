import type {
  InvestmentSubTab,
  TransactionsSubTab,
  SectionId,
  SnapshotKind,
  SortDirection,
  TxSortColumn,
} from '../types'
import type { Month } from '../../lib/month'
import type { RegistryFilters } from '../../domain/transactions/registry'

export interface UiState {
  activeSection: SectionId
  month: Month
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
  wealthCalcTargetId: string
  wealthCalcTargetName: string
  investmentTab: InvestmentSubTab
  investmentTxEditingId: string
  investmentYearFilter: number
  investmentOnlyUndeclared: boolean
  investmentReturnMode: 'simple' | 'twr'
  contributionWorkflowStep: 1 | 2
  contributionWorkflowMonth: Month
  contributionWorkflowDate: string
  contributionWorkflowAmount: number
  contributionCalcTargetKind: SnapshotKind | ''
  contributionCalcTargetId: string
  contributionCalcTargetName: string
}
