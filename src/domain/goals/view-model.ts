import type { Month } from '../../lib/month'
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

export type GoalGroup = 'net' | 'investment'

export interface GoalRowViewModel {
  key: GoalKey
  /** The term or role of the slot: "Corto plazo", "Parte de la cartera"… */
  slot: string
  /** The goal's name, or the slot's own title ("Fondos indexados") when it has none. */
  name: string
  goal: Goal
  /** A goal without amount is a slot still to define. */
  defined: boolean
  current: number
  target: number
  /** 0–100, capped once the goal is met. */
  progress: number
  /** Negative once met: the surplus. */
  remaining: number
  met: boolean
  /** Months until December of the target year, at least one. */
  monthsLeft: number
  /** What has to be added each month to arrive on time; 0 once met. */
  monthlyNeeded: number
  /** Length of the goal's track on its scale, 0–100. */
  track: number
  /** Part of the portfolio goal (funds, crypto). */
  child: boolean
}

/** A monthly pace and the goals that set it (none when nothing is pending). */
export interface GoalPace {
  rate: number
  by: GoalKey[]
}

export interface GoalsViewModel {
  /** Short, medium and long term share one scale: net worth. */
  net: { rows: GoalRowViewModel[]; current: number; scaleMax: number; cursor: number }
  investment: {
    rows: GoalRowViewModel[]
    /** How the portfolio goal splits into its two parts and the rest. */
    allocation: { funds: number; crypto: number; total: number; rest: number }
  }
  pace: { net: GoalPace; investment: GoalPace }
  met: { count: number; total: number }
  /** The earliest deadline among the goals still pending. */
  next: { targetYear: number } | null
  savingGoals: SavingGoalRowViewModel[]
}

interface GoalSlot {
  /** Shown under the name: the term, or the goal's place in the portfolio. */
  slot: string
  /** The name a goal takes when it has none of its own. */
  title: string
  group: GoalGroup
  child: boolean
}

// In display order: the three terms, then the portfolio and its two parts.
const SLOTS: Record<GoalKey, GoalSlot> = {
  short: { slot: 'Corto plazo', title: 'Corto plazo', group: 'net', child: false },
  medium: { slot: 'Medio plazo', title: 'Medio plazo', group: 'net', child: false },
  long: { slot: 'Largo plazo', title: 'Largo plazo', group: 'net', child: false },
  investmentTotal: {
    slot: 'Cartera completa',
    title: 'Cartera total',
    group: 'investment',
    child: false,
  },
  investmentFunds: {
    slot: 'Parte de la cartera',
    title: 'Fondos indexados',
    group: 'investment',
    child: true,
  },
  investmentCrypto: {
    slot: 'Parte de la cartera',
    title: 'Criptomonedas',
    group: 'investment',
    child: true,
  },
}

const ORDER = Object.keys(SLOTS) as GoalKey[]

export function goalGroup(key: GoalKey): GoalGroup {
  return SLOTS[key].group
}

export function goalSlot(key: GoalKey): string {
  return SLOTS[key].slot
}

function buildCurrentMap(state: State, month: Month): Record<GoalKey, number> {
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

function monthsUntilGoal(targetYear: number, now: Date): number {
  const safeYear = Number.isFinite(Number(targetYear)) ? Number(targetYear) : now.getFullYear()
  const diffMonths = (safeYear - now.getFullYear()) * 12 + (11 - now.getMonth())

  return Math.max(diffMonths, 1)
}

function measure(
  key: GoalKey,
  goal: Goal,
  current: number,
  now: Date,
): Omit<GoalRowViewModel, 'track'> {
  const target = Math.max(round2(goal.targetAmount || 0), 0)
  const defined = target > 0
  const progress = defined ? Math.min((current / target) * 100, 100) : 0
  const remaining = round2(target - current)
  const met = defined && remaining <= 0
  const monthsLeft = monthsUntilGoal(goal.targetYear, now)

  const slot = SLOTS[key]

  return {
    key,
    slot: slot.slot,
    name: goal.name?.trim() || slot.title,
    goal,
    defined,
    current: round2(current),
    target,
    progress,
    remaining,
    met,
    monthsLeft,
    monthlyNeeded: defined && !met ? round2(remaining / monthsLeft) : 0,
    child: slot.child,
  }
}

function netPace(rows: GoalRowViewModel[]): GoalPace {
  const binding = rows.reduce<GoalRowViewModel | null>(
    (best, row) => (row.monthlyNeeded > (best?.monthlyNeeded ?? 0) ? row : best),
    null,
  )
  return binding ? { rate: binding.monthlyNeeded, by: [binding.key] } : { rate: 0, by: [] }
}

// The total and its two parts are separate targets: the portfolio has to grow
// at least as fast as the more demanding of the total and both parts together.
function investmentPace(rows: GoalRowViewModel[]): GoalPace {
  const total = rows.find((row) => !row.child)
  const parts = rows.filter((row) => row.child)
  const partsRate = round2(parts.reduce((sum, row) => sum + row.monthlyNeeded, 0))
  const totalRate = total?.monthlyNeeded ?? 0

  if (partsRate > totalRate) {
    return {
      rate: partsRate,
      by: parts.filter((row) => row.monthlyNeeded > 0).map((row) => row.key),
    }
  }
  return totalRate > 0 && total ? { rate: totalRate, by: [total.key] } : { rate: 0, by: [] }
}

export interface SavingGoalRowViewModel {
  id: string
  name: string
  category: string
  /** Everything saved in the category, including savings made before the goal existed. */
  saved: number
  target: number
  /** 0–100, capped once the goal is met. */
  progress: number
  /** Negative once met: the surplus. */
  remaining: number
  met: boolean
}

/** The user's savings goals, each measured by the savings of its category. */
export function buildSavingGoals(state: State): SavingGoalRowViewModel[] {
  const savedByCategory = new Map<string, number>()
  for (const tx of state.transactions) {
    if (tx.type !== 'saving') continue
    savedByCategory.set(
      tx.category,
      (savedByCategory.get(tx.category) ?? 0) + Number(tx.amount || 0),
    )
  }
  return state.savingGoals.map((goal) => {
    const saved = round2(savedByCategory.get(goal.category) ?? 0)
    const target = Math.max(round2(goal.targetAmount || 0), 0)
    const remaining = round2(target - saved)
    return {
      id: goal.id,
      name: goal.name,
      category: goal.category,
      saved,
      target,
      progress: target > 0 ? Math.min((saved / target) * 100, 100) : 0,
      remaining,
      met: target > 0 && remaining <= 0,
    }
  })
}

export function buildGoalsViewModel(state: State, month: Month, now = new Date()): GoalsViewModel {
  const currentMap = buildCurrentMap(state, month)
  const measured = ORDER.map((key) => ({
    group: SLOTS[key].group,
    row: measure(key, state.goals[key], currentMap[key], now),
  }))

  const netCurrent = round2(currentMap.short)
  const netMeasured = measured.filter((item) => item.group === 'net').map((item) => item.row)
  const scaleMax = Math.max(netCurrent, ...netMeasured.map((row) => row.target), 0)
  const onScale = (value: number) => (scaleMax > 0 ? (Math.max(value, 0) / scaleMax) * 100 : 0)

  const netRows = netMeasured.map((row) => ({ ...row, track: onScale(row.target) }))
  const investmentRows = measured
    .filter((item) => item.group === 'investment')
    .map((item) => ({ ...item.row, track: 100 }))

  const all = [...netRows, ...investmentRows]
  const defined = all.filter((row) => row.defined)
  const pending = defined.filter((row) => !row.met)
  const nextYear = pending.length ? Math.min(...pending.map((row) => row.goal.targetYear)) : null

  const funds = state.goals.investmentFunds.targetAmount || 0
  const crypto = state.goals.investmentCrypto.targetAmount || 0
  const total = state.goals.investmentTotal.targetAmount || 0

  return {
    net: { rows: netRows, current: netCurrent, scaleMax, cursor: onScale(netCurrent) },
    investment: {
      rows: investmentRows,
      allocation: { funds, crypto, total, rest: round2(total - funds - crypto) },
    },
    pace: { net: netPace(netRows), investment: investmentPace(investmentRows) },
    met: { count: defined.filter((row) => row.met).length, total: defined.length },
    next: nextYear === null ? null : { targetYear: nextYear },
    savingGoals: buildSavingGoals(state),
  }
}

export interface GoalEditPreview {
  row: GoalRowViewModel
  group: GoalGroup
  /** The pace of the goal's group as saved, and with the draft in its place. */
  before: GoalPace
  after: GoalPace
  /** Each goal's name with the draft applied, to name the goals that set a pace. */
  names: Record<GoalKey, string>
}

/** What a draft of one goal would show, to read it before saving. */
export function previewGoalEdit(
  state: State,
  month: Month,
  key: GoalKey,
  draft: Goal,
  now = new Date(),
): GoalEditPreview {
  const group = goalGroup(key)
  const before = buildGoalsViewModel(state, month, now)
  const after = buildGoalsViewModel(
    { ...state, goals: { ...state.goals, [key]: draft } },
    month,
    now,
  )
  const rows = [...after.net.rows, ...after.investment.rows]
  const row = rows.find((item) => item.key === key)!
  const names = Object.fromEntries(rows.map((item) => [item.key, item.name])) as Record<
    GoalKey,
    string
  >

  return { row, group, before: before.pace[group], after: after.pace[group], names }
}
