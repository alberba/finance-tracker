import type {
  BudgetType,
  InvestmentSubTab,
  SectionId,
  SnapshotKind,
  SortDirection,
  TxSortColumn,
} from '../types'
import type { TransactionFilters } from '../transactions'

export interface UiState {
  activeSection: SectionId
  month: number
  budgetType: BudgetType
  budgetMonth: number
  txFilterMonth: number
  txSort: {
    column: TxSortColumn
    direction: SortDirection
  }
  txOpenHeaderFilter: TxSortColumn | ''
  txSelectedIds: string[]
  txFilters: TransactionFilters
  txEditingId: string
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
