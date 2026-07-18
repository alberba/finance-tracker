import { decorateCategoryLabel } from '../../scripts/category-emoji'
import { MONTHS, type BudgetType, type State } from '../../scripts/types'
import { round2 } from '../../scripts/utils'

export interface BudgetMonthCell {
  month: number
  monthLabel: string
  planned: number
  actual: number
  diff: number
  diffTone: 'good' | 'bad'
}

export interface BudgetCategoryRow {
  category: string
  label: string
  plannedTotal: number
  actualTotal: number
  diffTotal: number
  diffTone: 'good' | 'bad'
  cells: BudgetMonthCell[]
}

export interface BudgetBlockViewModel {
  type: BudgetType
  title: string
  description: string
  plannedTotal: number
  actualTotal: number
  diffTotal: number
  diffTone: 'good' | 'bad'
  rows: BudgetCategoryRow[]
}

export interface BudgetSummaryViewModel {
  plannedTotal: number
  actualTotal: number
  diffTotal: number
  diffTone: 'good' | 'bad'
}

export interface BudgetViewModel {
  months: readonly string[]
  summary: BudgetSummaryViewModel
  blocks: BudgetBlockViewModel[]
}

const budgetTypes: BudgetType[] = ['income', 'expense', 'investment']

const budgetTypeMeta: Record<BudgetType, { title: string; description: string }> = {
  income: { title: 'Ingresos', description: 'Planifica cuánto esperas ingresar cada mes.' },
  expense: {
    title: 'Gastos',
    description: 'Controla el gasto previsto y el real acumulado por categoría.',
  },
  investment: {
    title: 'Inversión',
    description: 'Ajusta las aportaciones mensuales y compara la ejecución real.',
  },
}

function getCategoriesForType(state: State, type: BudgetType): string[] {
  if (type === 'income') {
    return state.incomeCategories
  }
  if (type === 'expense') {
    return state.expenseCategories
  }
  return state.investmentCategories
}

function getBudgetValue(state: State, type: BudgetType, category: string, month: number): number {
  return round2(state.budget[type]?.[category]?.[month] || 0)
}

function getCategoryActuals(state: State, type: BudgetType, month: number): Record<string, number> {
  const actuals: Record<string, number> = {}

  getCategoriesForType(state, type).forEach((category) => {
    actuals[category] = 0
  })

  state.transactions
    .filter((transaction) => Number(transaction.month) === month && transaction.type === type)
    .forEach((transaction) => {
      if (!actuals[transaction.category]) {
        actuals[transaction.category] = 0
      }
      actuals[transaction.category] += Number(transaction.amount || 0)
    })

  Object.keys(actuals).forEach((category) => {
    actuals[category] = round2(actuals[category])
  })

  return actuals
}

function getDiffTone(type: BudgetType, diff: number): 'good' | 'bad' {
  if (type === 'income') {
    return diff >= 0 ? 'good' : 'bad'
  }

  return diff > 0 ? 'bad' : 'good'
}

function buildBudgetBlock(state: State, type: BudgetType): BudgetBlockViewModel {
  const rows = getCategoriesForType(state, type).map((category) => {
    let plannedTotal = 0
    let actualTotal = 0

    const cells = MONTHS.map((monthLabel, month) => {
      const planned = getBudgetValue(state, type, category, month)
      const actual = round2(getCategoryActuals(state, type, month)[category] || 0)
      const diff = round2(actual - planned)

      plannedTotal += planned
      actualTotal += actual

      return {
        month,
        monthLabel,
        planned,
        actual,
        diff,
        diffTone: getDiffTone(type, diff),
      }
    })

    const diffTotal = round2(actualTotal - plannedTotal)

    return {
      category,
      label: decorateCategoryLabel(type, category, state.categoryEmojis),
      plannedTotal: round2(plannedTotal),
      actualTotal: round2(actualTotal),
      diffTotal,
      diffTone: getDiffTone(type, diffTotal),
      cells,
    }
  })

  const plannedTotal = round2(
    rows.reduce((total, row) => total + row.plannedTotal, 0),
  )
  const actualTotal = round2(rows.reduce((total, row) => total + row.actualTotal, 0))
  const diffTotal = round2(actualTotal - plannedTotal)

  return {
    type,
    ...budgetTypeMeta[type],
    plannedTotal,
    actualTotal,
    diffTotal,
    diffTone: getDiffTone(type, diffTotal),
    rows,
  }
}

export function buildBudgetViewModel(state: State): BudgetViewModel {
  const blocks = budgetTypes.map((type) => buildBudgetBlock(state, type))
  const plannedTotal = round2(blocks.reduce((total, block) => total + block.plannedTotal, 0))
  const actualTotal = round2(blocks.reduce((total, block) => total + block.actualTotal, 0))
  const diffTotal = round2(actualTotal - plannedTotal)

  return {
    months: MONTHS,
    summary: {
      plannedTotal,
      actualTotal,
      diffTotal,
      diffTone: diffTotal > 0 ? 'bad' : 'good',
    },
    blocks,
  }
}
