<script setup lang="ts">
import {
  computed,
  nextTick,
  onBeforeUnmount,
  onMounted,
  reactive,
  ref,
  useTemplateRef,
  watch,
} from 'vue'

import IconButton from '../ui/IconButton.vue'
import KickerLabel from '../ui/KickerLabel.vue'
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

// Every category of one budget type, month by month. Three and six months show
// a compliance bar per cell; the whole year, one quiet figure per cell. The
// budget field is always drawn as editable (a box, or a dashed underline in the
// year grid); on mobile the table is read-only and edits go through the panel.
const props = defineProps<{
  view: BudgetTypeViewModel
  currentMonth: number
  year: number
}>()

const emit = defineEmits<{
  plan: [category: string]
  update: [category: string, month: number, value: number]
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

const months = computed(() => Array.from({ length: range.value }, (_, i) => start.value + i))
const bars = computed(() => range.value < 12)
const windowLabel = computed(() =>
  bars.value
    ? `${shortMonth(start.value)} – ${shortMonth(start.value + range.value - 1)} ${props.year}`
    : `Todo ${props.year}`,
)
const span = computed(() => deviationSpan(props.currentMonth))

const desktop = useMediaQuery('(min-width: 640px)')

// Exact amounts only fit three months on a wide screen; elsewhere, whole euros.
const wide = computed(() => range.value === 3 && desktop.value)
function amount(value: number): string {
  return wide.value ? formatMoney(value) : formatWholeAmount(value)
}
function signed(value: number): string {
  return wide.value ? formatSignedMoney(value) : formatSignedWhole(value)
}

// On mobile, six months and the year open scrolled to the month in progress.
const scroller = useTemplateRef<HTMLElement>('scroller')
async function scrollToCurrent(): Promise<void> {
  await nextTick()
  const element = scroller.value
  if (!element) return
  if (desktop.value || range.value === 3) {
    element.scrollLeft = 0
    return
  }
  const column = element.querySelector<HTMLElement>(`th[data-month="${props.currentMonth - 1}"]`)
  const sticky = element.querySelector<HTMLElement>('th[data-budget-category-head]')
  element.scrollLeft = column ? column.offsetLeft - (sticky?.offsetWidth ?? 0) : 0
}
watch([range, desktop], () => void scrollToCurrent())
onMounted(() => void scrollToCurrent())

const invalid = reactive(new Set<string>())

function onInput(category: string, month: number, event: Event): void {
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
    Math.max(0, ...months.value.map((m) => Math.max(cells[m].planned, cells[m].actual ?? 0))) * 1.12
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

const FIELD =
  'border-line-strong bg-subtle text-text-main hover:border-primary focus:border-primary font-display h-8 rounded-sm border px-2 text-right text-sm font-medium tabular-nums outline-none focus:shadow-[0_0_0_3px_var(--ring)] aria-[invalid=true]:border-loss'
const QUIET_FIELD =
  'border-line-strong text-text-muted hover:border-primary hover:bg-subtle focus:bg-panel focus:shadow-[0_0_0_2px_var(--primary)] font-display h-6 w-full min-w-0 border-0 border-b border-dashed bg-transparent px-0.5 text-right text-xs font-medium tabular-nums outline-none focus:rounded-xs focus:border-transparent aria-[invalid=true]:border-solid aria-[invalid=true]:border-loss'
const HEAD = 'text-text-muted text-xs font-semibold tracking-wider uppercase'
const STICKY = 'bg-panel sticky left-0 z-[1]'
</script>

<template>
  <section
    class="border-line bg-panel shadow-soft grid min-w-0 gap-5 rounded-lg border px-4 py-6 sm:px-8 sm:py-7"
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
            >: escribe en el campo para cambiarlo</template
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
            :disabled="start === 0"
            @click="start = moveWindow(start, range, -1)"
          />
          <IconButton
            label="Meses siguientes"
            icon="chevron-right"
            :disabled="start + range >= 12"
            @click="start = moveWindow(start, range, 1)"
          />
        </template>
      </div>
    </div>

    <p v-if="!view.rows.length" class="text-text-muted">
      No hay categorías de {{ TYPE_LABEL[view.type].toLowerCase() }}. Añádelas en Configuración.
    </p>

    <template v-else>
      <p v-if="bars" class="text-text-muted flex flex-wrap gap-4.5 text-xs" aria-hidden="true">
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

      <div ref="scroller" class="-mx-4 min-w-0 overflow-x-auto px-4 sm:mx-0 sm:px-0">
        <table
          class="w-full border-collapse sm:table-fixed"
          :aria-label="`${TYPE_LABEL[view.type]} por categoría y mes`"
        >
          <colgroup>
            <col class="w-24" :class="bars ? 'sm:w-52' : 'sm:w-36'" />
            <col v-for="month in months" :key="month" :class="bars ? 'min-w-20' : 'min-w-16'" />
            <col v-if="!bars" class="w-24 sm:w-28" />
          </colgroup>
          <thead>
            <tr>
              <th
                scope="col"
                data-budget-category-head
                :class="[HEAD, STICKY, 'pr-3 pb-2.5 text-left align-bottom']"
              >
                Categoría
              </th>
              <th
                v-for="month in months"
                :key="month"
                scope="col"
                :data-month="month"
                class="px-1 pb-2.5 align-bottom"
                :class="[
                  bars ? 'text-left' : 'rounded-t-md text-right',
                  !bars && month === currentMonth ? 'bg-subtle' : '',
                ]"
              >
                <span
                  v-if="bars"
                  class="font-display text-text-main grid gap-0.5 text-sm font-bold sm:text-base"
                >
                  {{ desktop && range === 3 ? formatMonthName(month) : shortMonth(month) }}
                  <span
                    class="text-text-muted font-mono text-[0.625rem] font-normal tracking-widest uppercase"
                  >
                    {{ STATUS_TAG[statusOf(month, currentMonth)] }}
                  </span>
                </span>
                <span
                  v-else
                  class="inline-flex items-center gap-1.5 text-sm"
                  :class="
                    month === currentMonth
                      ? 'text-text-main font-bold'
                      : 'text-text-muted font-semibold'
                  "
                >
                  {{ shortMonth(month) }}
                  <template v-if="month === currentMonth">
                    <span class="bg-primary size-1.5 rounded-full" aria-hidden="true"></span>
                    <span class="sr-only">en curso</span>
                  </template>
                </span>
              </th>
              <th
                v-if="!bars"
                scope="col"
                class="text-text-muted pb-2.5 pl-3 text-right text-sm font-semibold"
              >
                Desvío {{ span }}
              </th>
            </tr>
          </thead>

          <tbody>
            <tr v-for="row in view.rows" :key="row.category" :data-budget-row="row.category">
              <th
                scope="row"
                class="border-line border-t pr-3 text-left align-middle font-normal"
                :class="[STICKY, bars ? 'py-4' : 'py-3']"
              >
                <button
                  type="button"
                  class="text-text-main focus-visible:outline-primary min-h-6 text-left text-sm font-bold underline-offset-3 hover:underline focus-visible:outline-2 sm:text-base"
                  :aria-label="`Planificar los doce meses de ${row.category}`"
                  :data-budget-category="row.category"
                  @click="emit('plan', row.category)"
                >
                  {{ row.label }}
                </button>
                <span v-if="bars" class="mt-1 hidden gap-1 text-sm sm:grid">
                  <span class="text-text-muted"
                    ><span class="font-display text-text-main/80">{{
                      formatMoney(row.actualTotal)
                    }}</span>
                    de {{ formatMoney(row.plannedTotal) }}</span
                  >
                  <span v-if="span" class="font-display text-xs" :class="toneClass(row.tone)">
                    {{ formatSignedMoney(row.diffToDate) }} {{ span }}
                  </span>
                </span>
              </th>

              <td
                v-for="month in months"
                :key="month"
                class="border-line min-w-0 border-t px-1 align-middle"
                :class="[
                  bars ? 'py-4' : 'py-3',
                  !bars && month === currentMonth ? 'bg-subtle' : '',
                ]"
                :title="cellTitle(row.cells[month])"
                :data-month="month"
              >
                <div v-if="bars" class="grid gap-2.5">
                  <div class="flex flex-wrap items-baseline justify-between gap-x-2 gap-y-1">
                    <span
                      class="font-display font-medium tracking-tight tabular-nums"
                      :class="[
                        actualClass(row.cells[month]),
                        range === 3 ? 'sm:text-xl' : 'sm:text-base',
                      ]"
                    >
                      {{ actualText(row.cells[month]) }}
                    </span>
                    <label v-if="desktop" class="text-text-muted flex items-center gap-1.5 text-xs">
                      de
                      <span class="sr-only">
                        Presupuesto de {{ row.category }} en {{ monthName(month) }}</span
                      >
                      <input
                        type="text"
                        inputmode="decimal"
                        autocomplete="off"
                        :class="[FIELD, range === 3 ? 'w-24' : 'w-22.5']"
                        :value="formatDecimalInput(row.cells[month].planned)"
                        :aria-invalid="invalid.has(`${row.category}|${month}`)"
                        data-budget-cell
                        :data-category="row.category"
                        :data-month="month"
                        @change="onInput(row.category, month, $event)"
                      />
                    </label>
                    <span v-else class="text-text-muted font-display text-xs tabular-nums">
                      de {{ formatWholeAmount(row.cells[month].planned) }}
                    </span>
                  </div>
                  <span class="bg-track relative flex h-2 rounded-xs" aria-hidden="true">
                    <span
                      class="h-full rounded-l-xs"
                      :class="
                        row.cells[month].status === 'current' ? 'bg-text-muted' : 'bg-text-main/75'
                      "
                      :style="{ width: `${barsByRow.get(row.category)![month].fill}%` }"
                    ></span>
                    <span
                      class="h-full"
                      :class="overClass(row.cells[month])"
                      :style="{ width: `${barsByRow.get(row.category)![month].over}%` }"
                    ></span>
                    <span
                      class="bg-text-main absolute -top-1 -bottom-1 -ml-px w-0.5"
                      :style="{ left: `${barsByRow.get(row.category)![month].plan}%` }"
                    ></span>
                  </span>
                  <span
                    class="font-display min-h-4 text-xs tabular-nums"
                    :class="toneClass(row.cells[month].tone)"
                  >
                    {{ deviationText(row.cells[month]) }}
                  </span>
                </div>

                <div v-else class="grid justify-items-end gap-1">
                  <span
                    class="font-display text-sm font-medium tracking-tight tabular-nums"
                    :class="actualClass(row.cells[month])"
                  >
                    {{
                      row.cells[month].actual === null
                        ? '—'
                        : formatWholeAmount(row.cells[month].actual!)
                    }}
                  </span>
                  <label v-if="desktop" class="flex w-full justify-end">
                    <span class="sr-only">
                      Presupuesto de {{ row.category }} en {{ monthName(month) }}</span
                    >
                    <input
                      type="text"
                      inputmode="decimal"
                      autocomplete="off"
                      :class="QUIET_FIELD"
                      :value="formatDecimalInput(row.cells[month].planned)"
                      :aria-invalid="invalid.has(`${row.category}|${month}`)"
                      data-budget-cell
                      :data-category="row.category"
                      :data-month="month"
                      @change="onInput(row.category, month, $event)"
                    />
                  </label>
                  <span v-else class="text-text-muted font-display text-xs tabular-nums">
                    {{ formatWholeAmount(row.cells[month].planned) }}
                  </span>
                </div>
              </td>

              <td v-if="!bars" class="border-line border-t py-3 pl-3 text-right align-middle">
                <span
                  class="font-display block text-sm font-medium tabular-nums"
                  :class="toneClass(row.tone)"
                >
                  {{ formatSignedWhole(row.diffToDate) }}
                </span>
                <span class="text-text-muted block text-xs">
                  {{ formatWholeAmount(row.plannedTotal) }} previstos
                </span>
              </td>
            </tr>
          </tbody>

          <tfoot>
            <tr data-budget-row="total">
              <th
                scope="row"
                class="border-line-strong border-t pr-3 text-left align-middle"
                :class="[STICKY, bars ? 'py-4' : 'py-3']"
              >
                <span class="font-display text-base font-bold">Total</span>
                <span v-if="bars" class="mt-1 hidden gap-1 text-sm font-normal sm:grid">
                  <span class="text-text-muted"
                    ><span class="font-display text-text-main/80">{{
                      formatMoney(view.totals.actualTotal)
                    }}</span>
                    de {{ formatMoney(view.totals.plannedTotal) }}</span
                  >
                  <span
                    v-if="span"
                    class="font-display text-xs"
                    :class="toneClass(view.totals.tone)"
                  >
                    {{ formatSignedMoney(view.totals.diffToDate) }} {{ span }}
                  </span>
                </span>
              </th>
              <td
                v-for="month in months"
                :key="month"
                class="border-line-strong border-t px-1 align-middle"
                :class="[
                  bars ? 'py-4' : 'rounded-b-md py-3 text-right',
                  !bars && month === currentMonth ? 'bg-subtle' : '',
                ]"
                :data-month="month"
              >
                <span
                  class="font-display block font-bold tabular-nums"
                  :class="[
                    bars ? 'text-base' : 'text-sm',
                    !bars ? actualClass(view.totals.cells[month]) : 'text-text-main',
                  ]"
                >
                  {{ actualText(view.totals.cells[month]) }}
                </span>
                <span class="text-text-muted font-display block text-xs tabular-nums">
                  {{ bars ? 'de ' : '' }}{{ amount(view.totals.cells[month].planned) }}
                </span>
                <span
                  v-if="bars"
                  class="font-display block min-h-4 text-xs tabular-nums"
                  :class="toneClass(view.totals.cells[month].tone)"
                >
                  {{ deviationText(view.totals.cells[month]) }}
                </span>
              </td>
              <td
                v-if="!bars"
                class="border-line-strong border-t py-3 pl-3 text-right align-middle"
              >
                <span
                  class="font-display block text-sm font-bold tabular-nums"
                  :class="toneClass(view.totals.tone)"
                >
                  {{ formatSignedWhole(view.totals.diffToDate) }}
                </span>
                <span class="text-text-muted block text-xs">
                  {{ formatWholeAmount(view.totals.plannedTotal) }} previstos
                </span>
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </template>
  </section>
</template>
