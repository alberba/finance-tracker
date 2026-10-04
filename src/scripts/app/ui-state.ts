import type {
  InvestmentSubTab,
  TransactionsSubTab,
  SectionId,
  SnapshotKind,
  SortDirection,
  TxSortColumn,
} from '../types'
import type { RegistryFilters } from '../../domain/transactions/registry'

export interface UiState {
  activeSection: SectionId
  month: number
  /** Year the Movimientos registry shows. */
  txYear: number
  /** Month of that year the ink band shows. */
  txFilterMonth: number
  txSort: {
    column: TxSortColumn
    direction: SortDirection
  }
  txSelectedIds: string[]
  txFilters: RegistryFilters
  txTab: TransactionsSubTab
  snapshotMonth: number
  investmentMonth: number
  wealthCalcTargetId: string
  wealthCalcTargetName: string
  investmentTab: InvestmentSubTab
  investmentTxEditingId: string
  investmentYearFilter: number
  investmentOnlyUndeclared: boolean
  investmentReturnMode: 'simple' | 'twr'
  contributionWorkflowStep: 1 | 2
  contributionWorkflowMonth: number
  contributionWorkflowDate: string
  contributionWorkflowAmount: number
  contributionCalcTargetKind: SnapshotKind | ''
  contributionCalcTargetId: string
  contributionCalcTargetName: string
}
