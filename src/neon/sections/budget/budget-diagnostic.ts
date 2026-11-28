import type { BudgetViewModel } from '../../../domain/budget/view-model'
import type { DiagnosticCode, ScreenDiagnostic } from '../../../domain/reports/diagnostic'
import type { Month } from '../../../lib/month'
import type { BudgetType, Transaction } from '../../../scripts/types'
import { monthFromISO } from '../../../scripts/utils'

export function diagnoseBudget(
  view: BudgetViewModel,
  movements: readonly Transaction[],
  scope: {
    subview: NonNullable<ScreenDiagnostic['subview']>
    months?: readonly Month[]
    type?: BudgetType
    category?: string | null
  },
): ScreenDiagnostic {
  const first = scope.months?.[0]
  const last = scope.months?.at(-1)
  const checks = new Set<DiagnosticCode>()

  for (const movement of movements) {
    if (scope.months && !scope.months.includes(movement.month)) continue
    if (scope.type && scope.type !== movement.type) continue
    if (scope.category && scope.category !== movement.category) continue

    const rows = view.types[movement.type].rows
    checks.add(
      rows.some((row) => row.category === movement.category)
        ? 'budget-categorized'
        : 'budget-uncategorized',
    )
    if (monthFromISO(movement.date) !== movement.month) checks.add('budget-accounting-month')
  }

  return {
    subview: scope.subview,
    year: view.year,
    month: last,
    ...(first !== last ? { fromYear: view.year, fromMonth: first } : {}),
    options: scope.type ? [scope.type] : undefined,
    checks: checks.size ? [...checks] : ['budget-empty', 'insufficient'],
  }
}
