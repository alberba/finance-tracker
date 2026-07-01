import { getCategoryEmoji } from '../category-emoji'
import { round2 } from '../utils'

export interface InvestmentProgressItem {
  category: string
  icon: string
  actual: number
  plannedLabel: string
  progress: number
}

interface BuildInvestmentProgressItemsOptions {
  actuals: Record<string, number>
  month: number
  getBudgetValue: (category: string, month: number) => number
  formatMoney: (value: number) => string
}

export function buildDashboardInvestmentProgressItems({
  actuals,
  month,
  getBudgetValue,
  formatMoney,
}: BuildInvestmentProgressItemsOptions): InvestmentProgressItem[] {
  return Object.entries(actuals)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([category, actual]) => {
      const planned = round2(getBudgetValue(category, month))
      const progress = calculateInvestmentCompletionPercent(actual, planned)

      return {
        category,
        icon: getCategoryEmoji('investment', category),
        actual: actual,
        plannedLabel: formatPlanMoney(planned, formatMoney),
        progress,
      }
    })
}

function formatPlanMoney(value: number, formatMoney: (value: number) => string): string {
  return formatMoney(value).replace(/,00(?=\s*€$)/, '')
}

function calculateInvestmentCompletionPercent(actual: number, planned: number) {
  if (planned <= 0) {
    return actual > 0 ? 100 : 0
  }

  return Math.min(Math.max((actual / planned) * 100, 0), 100)
}
