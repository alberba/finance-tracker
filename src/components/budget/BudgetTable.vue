<script setup lang="ts">
import { ALL_MONTHS, atMonth, monthIndex, type Month } from '../../lib/month'
import { computed, reactive, ref, watch } from 'vue'

import IconButton from '../ui/IconButton.vue'
import KickerLabel from '../ui/KickerLabel.vue'
import LedgerInput from '../ui/LedgerInput.vue'
import LedgerTable, { type LedgerColumn } from '../ui/LedgerTable.vue'
import SegmentedControl, { type SegmentedOption } from '../ui/SegmentedControl.vue'
import { TONE_TEXT } from '../ui/tone'
import { useMediaQuery } from '../../composables/useMediaQuery'
import { useMoneyFormatter } from '../../composables/useMoneyFormatter'
import { useStoredChoice } from '../../composables/useStoredChoice'
import {
  cellBar,
  defaultWindowStart,
  moveWindow,
  statusOf,
  type BudgetCell,
  type BudgetRange,
  type BudgetRow,
  type BudgetTypeViewModel,
} from '../../domain/budget/view-model'
import { formatMonthName, formatWholeAmount } from '../../lib/format'
import { formatDecimalInput, parseDecimal } from '../../lib/number'
import {
  deviationSpan,
  formatSignedWhole,
  monthName,
  PAST_LABEL,
  shortMonth,
  TYPE_LABEL,
} from './budget-text'

// Every category of one budget type, month by month, as a ledger. Three and
// six months show a compliance bar per cell; the whole year, one quiet figure
// per cell. On desktop the budget of each cell is typed in place (it reads as
// text until hover or focus); on mobile the table keeps one month, the one in
// progress, and edits go through the category's panel.
const props = defineProps<{
  view: BudgetTypeViewModel
  currentMonth: number
  year: number
}>()

const emit = defineEmits<{
  plan: [category: string]
  update: [category: string, month: Month, value: number]
}>()

const { formatMoney, formatSignedMoney } = useMoneyFormatter()

const RANGES: SegmentedOption<'3' | '6' | '12'>[] = [
  { value: '3', label: '3 meses' },
  { value: '6', label: '6 meses' },
  { value: '12', label: 'Año' },
]

// The last range chosen is remembered per device.
const rangeValue = useStoredChoice('budget-range', ['3', '6', '12'] as const, '3')
const range = computed(() => Number(rangeValue.value) as BudgetRange)
const start = ref(defaultWindowStart(range.value, props.currentMonth))
watch(rangeValue, () => {
  start.value = defaultWindowStart(range.value, props.currentMonth)
})

const months = computed(() =>
  ALL_MONTHS.slice(monthIndex(start.value), monthIndex(start.value) + range.value),
)
const bars = computed(() => range.value < 12)
const windowLabel = computed(() =>
  bars.value
    ? `${shortMonth(months.value[0])} – ${shortMonth(months.value[range.value - 1])} ${props.year}`
    : `Todo ${props.year}`,
)
const span = computed(() => deviationSpan(props.currentMonth))

const desktop = useMediaQuery('(min-width: 640px)')

// The one month column mobile keeps: where the month in progress sits in the
// default window, so it is the current month until the arrows slide it.
const focusMonth = computed(() => {
  const offset = props.currentMonth - defaultWindowStart(range.value, props.currentMonth)
  return months.value[Math.max(0, Math.min(range.value - 1, offset))]
})

const columns = computed<LedgerColumn<BudgetRow>[]>(() => [
  { key: 'category', label: 'Categoría', rowHeader: true, class: bars.value ? 'sm:w-52' : '' },
  ...months.value.map((month): LedgerColumn<BudgetRow> => ({
    key: `month-${month}`,
    label: formatMonthName(month),
    align: bars.value ? 'left' : 'right',
    hideBelow: month === focusMonth.value ? undefined : 'sm',
    class: !bars.value && month === props.currentMonth ? 'bg-subtle' : '',
  })),
  ...(bars.value
    ? []
    : [{ key: 'deviation', label: `Desvío ${span.value}`, align: 'right' as const }]),
])

// Exact amounts only fit three months on a wide screen; elsewhere, whole euros.
const wide = computed(() => range.value === 3 && desktop.value)
function amount(value: number): string {
  return wide.value ? formatMoney(value) : formatWholeAmount(value)
}
function signed(value: number): string {
  return wide.value ? formatSignedMoney(value) : formatSignedWhole(value)
}

const invalid = reactive(new Set<string>())

function onInput(category: string, month: Month, event: Event): void {
  const target = event.target as HTMLInputElement
  const value = parseDecimal(target.value)
  const key = `${category}|${month}`
  if (!Number.isFinite(value) || value < 0) {
    invalid.add(key)
    return
  }
  invalid.delete(key)
  emit('update', category, month, value)
}

/** The largest amount of a row in the visible months, with a little headroom. */
function rowScale(cells: BudgetCell[]): number {
  return (
    Math.max(
      0,
      ...months.value.map((m) =>
        Math.max(atMonth(cells, m).planned, atMonth(cells, m).actual ?? 0),
      ),
    ) * 1.12
  )
}

// One compliance bar per visible cell, against its row's scale.
const barsByRow = computed(
  () =>
    new Map(
      props.view.rows.map((row) => {
        const scale = rowScale(row.cells)
        return [row.category, row.cells.map((cell) => cellBar(cell, scale))]
      }),
    ),
)

function cellTitle(cell: BudgetCell): string {
  const actual = cell.actual === null ? 'sin movimientos' : formatMoney(cell.actual)
  const diff = cell.diff === null ? '' : ` · ${formatSignedMoney(cell.diff)}`
  return `${formatMonthName(cell.month)}: ${actual} de ${formatMoney(cell.planned)} presupuestados${diff}`
}

const STATUS_TAG = { closed: 'cerrado', current: 'en curso', planned: 'previsto' } as const

function actualText(cell: BudgetCell): string {
  return cell.actual === null ? '—' : amount(cell.actual)
}

function actualClass(cell: BudgetCell): string {
  if (cell.actual === null) return 'text-text-muted'
  return cell.status === 'closed' && cell.tone === 'loss' ? 'text-loss' : 'text-text-main'
}

function toneClass(tone: BudgetCell['tone']): string {
  return tone ? TONE_TEXT[tone] : 'text-text-muted'
}

function deviationText(cell: BudgetCell): string {
  return cell.diff === null || Math.abs(cell.diff) < 0.005 ? '' : signed(cell.diff)
}

function overClass(cell: BudgetCell): string {
  if (cell.status !== 'closed') return 'bg-text-muted'
  return props.view.type === 'income' ? 'bg-gain' : 'bg-loss'
}

function inputLabel(category: string, month: Month): string {
  return `Presupuesto de ${category} en ${monthName(month)}`
}
</script>

<template>
  <section
    class="grid min-w-0 gap-5 py-6 sm:py-7"
    aria-labelledby="budget-table-title"
    :data-budget-type="view.type"
    :data-budget-months="range"
  >
    <div class="flex flex-wrap items-end justify-between gap-x-6 gap-y-4">
      <div class="grid gap-1.5">
        <KickerLabel>Plan y real · {{ windowLabel }}</KickerLabel>
        <h3 id="budget-table-title" class="font-display text-xl font-bold tracking-tight">
          Cada categoría, mes a mes
        </h3>
        <p v-if="bars" class="text-text-muted text-sm">
          Lo real de cada mes junto a su presupuesto<template v-if="desktop"
            >: escribe en la cifra para cambiarlo</template
          ><template v-else>. Toca una categoría para cambiarlo</template>.
        </p>
        <p v-else class="text-text-muted text-sm">
          {{ PAST_LABEL[view.type] }} arriba; debajo, el presupuesto<template v-if="desktop"
            >, que puedes cambiar ahí mismo</template
          ><template v-else>. Toca una categoría para cambiarlo</template>.
        </p>
      </div>
      <div class="flex items-center gap-2">
        <SegmentedControl
          v-model="rangeValue"
          :options="RANGES"
          label="Meses visibles"
          variant="soft"
          data-key="budget-range"
        />
        <template v-if="bars">
          <IconButton
            label="Meses anteriores"
            icon="chevron-left"
            :disabled="start === 1"
            @click="start = moveWindow(start, range, -1)"
          />
          <IconButton
            label="Meses siguientes"
            icon="chevron-right"
            :disabled="start + range > 12"
            @click="start = moveWindow(start, range, 1)"
          />
        </template>
      </div>
    </div>

    <p
      v-if="bars && view.rows.length"
      class="text-text-muted flex flex-wrap gap-4.5 text-xs"
      aria-hidden="true"
    >
      <span class="flex items-center gap-1.5"
        ><span class="bg-text-main/75 h-2 w-4.5 rounded-xs"></span>Real</span
      >
      <span class="flex items-center gap-1.5"
        ><span class="bg-text-main h-3.5 w-0.5"></span>Presupuesto</span
      >
      <span class="flex items-center gap-1.5"
        ><span
          class="h-2 w-4.5 rounded-xs"
          :class="view.type === 'income' ? 'bg-gain' : 'bg-loss'"
        ></span
        >Por encima</span
      >
    </p>

    <LedgerTable
      :columns="columns"
      :rows="view.rows"
      :row-key="(row) => row.category"
      :row-attrs="(row) => ({ 'data-budget-row': row.category })"
      :label="`${TYPE_LABEL[view.type]} por categoría y mes`"
      :empty-text="`No hay categorías de ${TYPE_LABEL[view.type].toLowerCase()}. Añádelas en Configuración.`"
    >
      <template #head-deviation>
        <span class="block whitespace-normal sm:whitespace-nowrap">Desvío {{ span }}</span>
      </template>
      <!-- Month headers: the name and, with bars, where the month stands. -->
      <template v-for="month in months" :key="month" #[`head-month-${month}`]>
        <span v-if="bars" class="grid gap-0.5" :class="{ 'text-text-main': month === focusMonth }">
          {{ desktop && range === 6 ? shortMonth(month) : formatMonthName(month) }}
          <span class="font-mono text-[0.625rem] font-normal tracking-widest">
            {{ STATUS_TAG[statusOf(month, currentMonth)] }}
          </span>
        </span>
        <span
          v-else
          class="inline-flex items-center gap-1.5"
          :class="{ 'text-text-main': month === currentMonth }"
        >
          {{ shortMonth(month) }}
          <template v-if="month === currentMonth">
            <span class="bg-primary size-1.5 rounded-full" aria-hidden="true"></span>
            <span class="sr-only">en curso</span>
          </template>
        </span>
      </template>

      <template #cell-category="{ row }">
        <button
          type="button"
          class="text-text-main focus-visible:outline-primary inline-flex min-h-11 items-center text-left font-bold whitespace-nowrap underline-offset-3 hover:underline focus-visible:outline-2"
          :aria-label="`Planificar los doce meses de ${row.category}`"
          :data-budget-category="row.category"
          @click="emit('plan', row.category)"
        >
          {{ row.label }}
        </button>
        <span v-if="bars" class="grid gap-1 pb-1 text-sm">
          <span class="text-text-muted"
            ><span class="font-display text-text-main/80">{{ formatMoney(row.actualTotal) }}</span>
            de {{ formatMoney(row.plannedTotal) }}</span
          >
          <span v-if="span" class="font-display text-xs" :class="toneClass(row.tone)">
            {{ formatSignedMoney(row.diffToDate) }} {{ span }}
          </span>
        </span>
      </template>

      <template v-for="month in months" :key="month" #[`cell-month-${month}`]="{ row }">
        <div v-if="bars" class="grid gap-2.5 py-2" :title="cellTitle(atMonth(row.cells, month))">
          <div class="flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
            <span
              class="font-display font-medium tracking-tight tabular-nums"
              :class="[
                actualClass(atMonth(row.cells, month)),
                range === 3 ? 'sm:text-xl' : 'sm:text-base',
              ]"
            >
              {{ actualText(atMonth(row.cells, month)) }}
            </span>
            <span
              v-if="desktop"
              class="text-text-muted flex items-center gap-0.5 text-xs"
              :class="range === 3 ? 'w-24' : 'w-22'"
            >
              de
              <LedgerInput
                :label="inputLabel(row.category, month)"
                :value="formatDecimalInput(atMonth(row.cells, month).planned)"
                :aria-invalid="invalid.has(`${row.category}|${month}`)"
                class="-mr-2 text-sm"
                data-budget-cell
                :data-category="row.category"
                :data-month="month"
                @change="onInput(row.category, month, $event)"
              />
            </span>
            <span v-else class="text-text-muted font-display text-xs tabular-nums">
              de {{ formatWholeAmount(atMonth(row.cells, month).planned) }}
            </span>
          </div>
          <span class="bg-track relative flex h-2 rounded-xs" aria-hidden="true">
            <span
              class="h-full rounded-l-xs"
              :class="
                atMonth(row.cells, month).status === 'current' ? 'bg-text-muted' : 'bg-text-main/75'
              "
              :style="{ width: `${atMonth(barsByRow.get(row.category)!, month).fill}%` }"
            ></span>
            <span
              class="h-full"
              :class="overClass(atMonth(row.cells, month))"
              :style="{ width: `${atMonth(barsByRow.get(row.category)!, month).over}%` }"
            ></span>
            <span
              class="bg-text-main absolute -top-1 -bottom-1 -ml-px w-0.5"
              :style="{ left: `${atMonth(barsByRow.get(row.category)!, month).plan}%` }"
            ></span>
          </span>
          <span
            class="font-display min-h-4 text-xs tabular-nums"
            :class="toneClass(atMonth(row.cells, month).tone)"
          >
            {{ deviationText(atMonth(row.cells, month)) }}
          </span>
        </div>

        <div v-else class="grid justify-items-end" :title="cellTitle(atMonth(row.cells, month))">
          <span
            class="font-display text-sm font-medium tracking-tight tabular-nums"
            :class="actualClass(atMonth(row.cells, month))"
          >
            {{
              atMonth(row.cells, month).actual === null
                ? '—'
                : formatWholeAmount(atMonth(row.cells, month).actual!)
            }}
          </span>
          <LedgerInput
            v-if="desktop"
            :label="inputLabel(row.category, month)"
            :value="formatDecimalInput(atMonth(row.cells, month).planned)"
            :aria-invalid="invalid.has(`${row.category}|${month}`)"
            class="text-text-muted -mr-2 text-xs"
            data-budget-cell
            :data-category="row.category"
            :data-month="month"
            @change="onInput(row.category, month, $event)"
          />
          <span v-else class="text-text-muted font-display text-xs tabular-nums">
            {{ formatWholeAmount(atMonth(row.cells, month).planned) }}
          </span>
        </div>
      </template>

      <template #cell-deviation="{ row }">
        <span
          class="font-display block text-sm font-medium tabular-nums"
          :class="toneClass(row.tone)"
        >
          {{ formatSignedWhole(row.diffToDate) }}
        </span>
        <span class="text-text-muted block text-xs whitespace-nowrap">
          {{ formatWholeAmount(row.plannedTotal) }} previstos
        </span>
      </template>

      <template #total-category>
        <span class="font-display text-base font-bold">Total</span>
        <span v-if="bars" class="grid gap-1 text-sm font-normal">
          <span class="text-text-muted"
            ><span class="font-display text-text-main/80">{{
              formatMoney(view.totals.actualTotal)
            }}</span>
            de {{ formatMoney(view.totals.plannedTotal) }}</span
          >
          <span v-if="span" class="font-display text-xs" :class="toneClass(view.totals.tone)">
            {{ formatSignedMoney(view.totals.diffToDate) }} {{ span }}
          </span>
        </span>
      </template>

      <template v-for="month in months" :key="month" #[`total-month-${month}`]>
        <span
          class="font-display block font-bold tabular-nums"
          :class="[
            bars ? 'text-base' : 'text-sm',
            bars ? 'text-text-main' : actualClass(atMonth(view.totals.cells, month)),
          ]"
        >
          {{ actualText(atMonth(view.totals.cells, month)) }}
        </span>
        <span class="text-text-muted font-display block text-xs tabular-nums">
          {{ bars ? 'de ' : '' }}{{ amount(atMonth(view.totals.cells, month).planned) }}
        </span>
        <span
          v-if="bars"
          class="font-display block min-h-4 text-xs tabular-nums"
          :class="toneClass(atMonth(view.totals.cells, month).tone)"
        >
          {{ deviationText(atMonth(view.totals.cells, month)) }}
        </span>
      </template>

      <template v-if="!bars" #total-deviation>
        <span
          class="font-display block text-sm font-bold tabular-nums"
          :class="toneClass(view.totals.tone)"
        >
          {{ formatSignedWhole(view.totals.diffToDate) }}
        </span>
        <span class="text-text-muted block text-xs whitespace-nowrap">
          {{ formatWholeAmount(view.totals.plannedTotal) }} previstos
        </span>
      </template>
    </LedgerTable>
  </section>
</template>
