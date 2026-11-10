import { computed, ref } from 'vue'

import { formatMonthName } from '../../../lib/format'
import { asMonth } from '../../../lib/month'
import { parseDecimal } from '../../../lib/number'
import { useBudgetStore } from '../../../stores/budget'
import { useNeonBudgetScreens } from './budget-screens'
import {
  allRows,
  buildPrepareGroups,
  cellsToWrite,
  defaultStart,
  freeFigures,
  hasSavedPlan,
  prepareTarget,
  repeatLabel,
  savedSummary,
  seedValue,
  split,
  startOptions,
  type StartMode,
} from './prepare-view-model'

/**
 * The state of «Hacer el presupuesto»: the plan of next month, the value of
 * each category, where it started from and what saving writes. The desktop
 * screen and the mobile one both read it.
 */
export function usePrepareSession() {
  const budgetStore = useBudgetStore()
  const screens = useNeonBudgetScreens()

  const view = computed(() => budgetStore.viewModel)
  const target = computed(() => prepareTarget(view.value))
  const groups = computed(() => (target.value ? buildPrepareGroups(view.value, target.value) : []))
  const rows = computed(() => allRows(groups.value))
  const saved = computed(() => hasSavedPlan(groups.value))

  const chosenStart = ref<StartMode | null>(null)
  const start = computed<StartMode>(() => {
    const chosen = chosenStart.value
    return chosen && (chosen !== 'saved' || saved.value) ? chosen : defaultStart(groups.value)
  })
  // Values edited by hand over the seed, and the raw text of the field being typed.
  const edited = ref<Record<string, number>>({})
  const drafts = ref<Record<string, string>>({})
  const repeat = ref(false)
  const confirmation = ref('')

  const values = computed(() =>
    Object.fromEntries(
      rows.value.map((row) => [row.key, edited.value[row.key] ?? seedValue(row, start.value)]),
    ),
  )
  const figure = computed(() => split(groups.value, values.value))
  const free = computed(() => freeFigures(figure.value.free))
  const currentMonth = computed(() => asMonth(view.value.currentMonth) ?? 1)
  const currentName = computed(() => formatMonthName(currentMonth.value))
  const targetName = computed(() =>
    target.value ? formatMonthName(target.value).toLowerCase() : '',
  )
  const closedCount = computed(() =>
    rows.value.reduce((max, row) => Math.max(max, row.closedCount), 0),
  )
  const options = computed(() => startOptions(currentMonth.value, saved.value))
  const repeatText = computed(() => (target.value ? repeatLabel(target.value) : null))
  const spendLegend = computed(() =>
    figure.value.groups.flatMap((g) => {
      const def = groups.value.find((x) => x.type === g.type)
      return def && !def.income ? [{ def, g }] : []
    }),
  )
  const segments = computed(() =>
    spendLegend.value
      .filter(({ g }) => g.total > 0)
      .map(({ def, g }) => ({ key: g.type, weight: g.total, swatch: def.swatch })),
  )
  const freeWeight = computed(() => Math.max(figure.value.free, 0))
  const freeShare = computed(() =>
    figure.value.income > 0 ? Math.round((freeWeight.value / figure.value.income) * 100) : null,
  )

  function groupTotal(type: string) {
    return figure.value.groups.find((g) => g.type === type)
  }

  function pickStart(mode: StartMode): void {
    chosenStart.value = mode
    edited.value = {}
    drafts.value = {}
    confirmation.value = ''
  }

  function setValue(key: string, value: number): void {
    edited.value = { ...edited.value, [key]: value }
    const next = { ...drafts.value }
    delete next[key]
    drafts.value = next
    confirmation.value = ''
  }

  function onInput(key: string, event: Event): void {
    const raw = (event.target as HTMLInputElement).value
    drafts.value = { ...drafts.value, [key]: raw }
    const number = raw.trim() === '' ? 0 : parseDecimal(raw)
    if (Number.isFinite(number) && number >= 0) edited.value = { ...edited.value, [key]: number }
    confirmation.value = ''
  }

  function onBlur(key: string): void {
    const next = { ...drafts.value }
    delete next[key]
    drafts.value = next
  }

  function save(): void {
    const month = target.value
    if (!month) return
    const withRepeat = repeat.value && month < 12
    for (const write of cellsToWrite(view.value, groups.value, values.value, month, withRepeat)) {
      budgetStore.updateBudgetValue(write.type, write.category, write.month, write.value)
    }
    const summary = savedSummary(month, withRepeat)
    confirmation.value = `${summary}.`
    screens.prepared = { month, summary }
  }

  return {
    view,
    target,
    groups,
    rows,
    saved,
    start,
    edited,
    drafts,
    repeat,
    confirmation,
    values,
    figure,
    free,
    currentMonth,
    currentName,
    targetName,
    closedCount,
    options,
    repeatText,
    spendLegend,
    segments,
    freeWeight,
    freeShare,
    groupTotal,
    pickStart,
    setValue,
    onInput,
    onBlur,
    save,
  }
}
