import {
  computeInvestmentValue,
  getWealthByMonth,
  type Entity,
  type Snapshot,
  type Transaction,
} from '../../lib/finance-core'
import type { Goal, GoalKey, State } from '../../scripts/types'
import { round2 } from '../../scripts/utils'
import { getInvestmentBuckets } from '../investment/buckets'

export interface GoalEditorViewModel {
  key: GoalKey
  title: string
  goal: Goal
}

export interface GoalProgressViewModel extends GoalEditorViewModel {
  current: number
  target: number
  progress: number
  remaining: number
  remainingTone: 'good' | 'bad'
  monthlyNeeded: number
}

export interface GoalsViewModel {
  editors: GoalEditorViewModel[]
  progressItems: GoalProgressViewModel[]
}

const goalOrder: Array<{ key: GoalKey; title: string }> = [
  { key: 'short', title: 'Corto plazo' },
  { key: 'medium', title: 'Medio plazo' },
  { key: 'long', title: 'Largo plazo' },
  { key: 'investmentTotal', title: 'Inversión total' },
  { key: 'investmentFunds', title: 'Fondos indexados' },
  { key: 'investmentCrypto', title: 'Criptomonedas' },
]

function buildCurrentMap(state: State, month: number): Record<GoalKey, number> {
  const wealth = getWealthByMonth(
    month,
    state.accounts as Entity[],
    state.investmentAssets as Entity[],
    state.liabilities as Entity[],
    state.transactions as Transaction[],
    state.snapshots as Record<string, Snapshot>,
  )
  const { fundsValue, cryptoValue } = getInvestmentBuckets(
    state.investmentAssets,
    month,
    (assetId, targetMonth) =>
      computeInvestmentValue(
        assetId,
        targetMonth,
        state.investmentAssets as Entity[],
        state.transactions as Transaction[],
        state.snapshots as Record<string, Snapshot>,
      ),
  )

  return {
    short: wealth.net,
    medium: wealth.net,
    long: wealth.net,
    investmentTotal: wealth.investment,
    investmentFunds: round2(fundsValue),
    investmentCrypto: round2(cryptoValue),
  }
}

function monthsUntilGoal(targetYear: number, now = new Date()): number {
  const safeYear = Number.isFinite(Number(targetYear)) ? Number(targetYear) : now.getFullYear()
  const end = new Date(safeYear, 11, 31)
  const diffMonths =
    (end.getFullYear() - now.getFullYear()) * 12 + (end.getMonth() - now.getMonth())

  return Math.max(diffMonths, 1)
}

export function buildGoalsViewModel(state: State, month: number): GoalsViewModel {
  const currentMap = buildCurrentMap(state, month)
  const editors = goalOrder.map(({ key, title }) => ({
    key,
    title,
    goal: state.goals[key],
  }))

  return {
    editors,
    progressItems: editors.map((editor) => {
      const current = round2(currentMap[editor.key] || 0)
      const target = Math.max(round2(editor.goal.targetAmount || 0), 0)
      const progress = target <= 0 ? 0 : Math.min((current / target) * 100, 100)
      const remaining = round2(target - current)
      const monthsLeft = monthsUntilGoal(editor.goal.targetYear)
      const monthlyNeeded = monthsLeft <= 0 ? remaining : round2(remaining / monthsLeft)

      return {
        ...editor,
        current,
        target,
        progress,
        remaining,
        remainingTone: remaining <= 0 ? 'good' : 'bad',
        monthlyNeeded,
      }
    }),
  }
}
