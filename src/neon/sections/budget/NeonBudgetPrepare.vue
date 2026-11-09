<script setup lang="ts">
import { computed, ref } from 'vue'

import { formatMoney, formatMonthName } from '../../../lib/format'
import { asMonth } from '../../../lib/month'
import { formatDecimalInput, parseDecimal } from '../../../lib/number'
import { useBudgetStore } from '../../../stores/budget'
import NeonButton from '../../ui/NeonButton.vue'
import NeonEmptyState from '../../ui/NeonEmptyState.vue'
import { useNeonBudgetScreens } from './budget-screens'
import {
  allRows,
  barLabel,
  buildPrepareGroups,
  cellsToWrite,
  defaultStart,
  freeFigures,
  hasSavedPlan,
  prepareKicker,
  prepareLede,
  prepareTarget,
  repeatLabel,
  rowNote,
  savedSummary,
  seedValue,
  shareText,
  showUseAverage,
  split,
  startOptions,
  stepFor,
  stepValue,
  type StartMode,
} from './prepare-view-model'

// «Hacer el presupuesto» (artboard «Presupuesto · 2560 px», #433): the plan of
// next month, a stepper per category and the split of the income beside it.
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
const targetName = computed(() => (target.value ? formatMonthName(target.value).toLowerCase() : ''))
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

const iconButton =
  'border-ctrl-line text-text outline-accent grid size-11 flex-none place-items-center rounded-full border focus-visible:outline-2 focus-visible:outline-offset-2 motion-safe:transition-transform motion-safe:duration-160 motion-safe:active:scale-[0.93]'
</script>

<template>
  <div class="@container grid min-w-0 content-start gap-5">
    <button
      type="button"
      class="text-text outline-accent rounded-pill inline-flex min-h-11 items-center gap-1.5 self-start py-0 pr-4 pl-2.5 text-[14px] font-extrabold underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2"
      @click="screens.go('month')"
    >
      <svg
        class="size-[18px]"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
        aria-hidden="true"
      >
        <path d="M19 12H5M11 6l-6 6 6 6" />
      </svg>
      Este mes
    </button>

    <template v-if="!target">
      <h1
        id="budget-title"
        tabindex="-1"
        class="font-display text-[clamp(30px,3.2cqi,44px)] leading-[1.1] font-bold tracking-[-0.03em] outline-none"
      >
        Hacer el presupuesto
      </h1>
      <NeonEmptyState role="status">No hay un mes siguiente que preparar este año.</NeonEmptyState>
    </template>

    <template v-else>
      <header class="flex flex-wrap items-end justify-between gap-x-6 gap-y-4">
        <div class="grid min-w-0 gap-2">
          <p class="text-muted text-label tracking-label font-extrabold uppercase">
            {{ prepareKicker(view.year, target) }}
          </p>
          <h1
            id="budget-title"
            tabindex="-1"
            class="font-display text-[clamp(30px,3.2cqi,44px)] leading-[1.1] font-bold tracking-[-0.03em] outline-none"
          >
            Hacer el presupuesto
          </h1>
          <p class="text-soft max-w-[60ch] text-[16px]">{{ prepareLede(closedCount) }}</p>
        </div>
        <div class="grid justify-items-end gap-1.5">
          <span class="text-muted text-label tracking-label font-extrabold uppercase">
            Empezar desde
          </span>
          <div
            role="group"
            aria-label="Empezar desde"
            class="bg-panel2 rounded-pill inline-flex max-w-full gap-[3px] p-[3px]"
          >
            <button
              v-for="option in options"
              :key="option.mode"
              type="button"
              :aria-pressed="start === option.mode"
              class="outline-accent rounded-pill min-h-9 px-3 text-[14px] font-extrabold whitespace-nowrap focus-visible:outline-2 focus-visible:-outline-offset-2"
              :class="start === option.mode ? 'bg-sel-bg text-sel-text' : 'text-soft'"
              @click="pickStart(option.mode)"
            >
              {{ option.label }}
            </button>
          </div>
        </div>
      </header>

      <div class="grid min-w-0 items-start gap-5 @[980px]:grid-cols-[minmax(0,1fr)_440px]">
        <div class="grid min-w-0 gap-4">
          <section
            v-for="group in groups"
            :key="group.type"
            :aria-labelledby="`prepare-${group.id}`"
            class="bg-panel border-line rounded-card grid min-w-0 border px-6 py-[22px]"
          >
            <div class="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 pb-3">
              <div class="flex min-w-0 items-baseline gap-2.5">
                <span
                  class="size-2.5 flex-none rounded-[3px]"
                  :class="group.swatch"
                  aria-hidden="true"
                ></span>
                <span class="grid min-w-0">
                  <h2 :id="`prepare-${group.id}`" class="text-[18px] font-extrabold">
                    {{ group.label }}
                  </h2>
                  <span class="text-muted text-[13px]">
                    {{ group.rows.length ? group.note : 'Sin categorías' }}
                  </span>
                </span>
              </div>
              <span class="flex items-baseline gap-2">
                <span
                  class="font-display text-[20px] font-semibold tracking-[-0.02em] tabular-nums"
                >
                  {{ formatMoney(groupTotal(group.type)?.total ?? 0) }}
                </span>
                <span v-if="!group.income" class="text-muted text-[13px] font-bold">
                  {{ shareText(groupTotal(group.type)?.share ?? null) }}
                </span>
              </span>
            </div>
            <ul v-if="group.rows.length" class="m-0 list-none p-0">
              <li
                v-for="row in group.rows"
                :key="row.key"
                class="border-line flex min-h-16 flex-wrap items-center gap-x-4 gap-y-2 border-t py-2.5"
              >
                <span class="grid min-w-0 flex-[1_1_200px]">
                  <span class="truncate text-[16px] font-bold">{{ row.label }}</span>
                  <span class="text-muted text-[13px]">{{ rowNote(row, currentName) }}</span>
                </span>
                <button
                  v-if="showUseAverage(row, values[row.key] ?? 0)"
                  type="button"
                  :aria-label="`Usar la media de ${formatMoney(row.average)} en ${row.category}`"
                  class="text-muted outline-accent min-h-11 flex-none text-[13px] font-bold underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2"
                  @click="setValue(row.key, row.average ?? 0)"
                >
                  Usar media
                </button>
                <span class="ml-auto flex flex-none items-center gap-1.5">
                  <button
                    type="button"
                    :class="iconButton"
                    :aria-label="`Restar ${stepFor(row.type, values[row.key] ?? 0)} € a ${row.category}`"
                    @click="setValue(row.key, stepValue(row.type, values[row.key] ?? 0, -1))"
                  >
                    <svg
                      class="size-5"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      stroke-width="2"
                      stroke-linecap="round"
                      aria-hidden="true"
                    >
                      <path d="M5 12h14" />
                    </svg>
                  </button>
                  <label class="flex items-center gap-1.5">
                    <span class="sr-only">{{ row.category }} en {{ targetName }}, en euros</span>
                    <input
                      type="text"
                      inputmode="decimal"
                      :value="drafts[row.key] ?? formatDecimalInput(values[row.key] ?? 0)"
                      class="bg-panel text-text outline-accent rounded-field font-display min-h-[46px] w-[104px] border px-3.5 text-end text-[15px] font-semibold tabular-nums focus-visible:outline-2 focus-visible:outline-offset-2"
                      :class="row.key in drafts ? 'border-accent' : 'border-ctrl-line'"
                      @input="onInput(row.key, $event)"
                      @blur="onBlur(row.key)"
                    />
                    <span class="text-muted text-[14px]" aria-hidden="true">€</span>
                  </label>
                  <button
                    type="button"
                    :class="iconButton"
                    :aria-label="`Sumar ${stepFor(row.type, values[row.key] ?? 0)} € a ${row.category}`"
                    @click="setValue(row.key, stepValue(row.type, values[row.key] ?? 0, 1))"
                  >
                    <svg
                      class="size-5"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      stroke-width="2"
                      stroke-linecap="round"
                      aria-hidden="true"
                    >
                      <path d="M12 5v14M5 12h14" />
                    </svg>
                  </button>
                </span>
              </li>
            </ul>
          </section>
        </div>

        <aside
          aria-labelledby="prepare-split-title"
          class="bg-panel border-line rounded-card sticky top-6 grid min-w-0 gap-[18px] border px-6 py-[22px]"
        >
          <div class="flex items-baseline justify-between gap-3">
            <h2 id="prepare-split-title" class="text-[18px] font-extrabold">Reparto del mes</h2>
            <span class="text-muted text-[14px]">
              Entra <b class="text-text font-extrabold">{{ formatMoney(figure.income) }}</b>
            </span>
          </div>
          <div
            role="img"
            :aria-label="barLabel(groups, figure)"
            class="flex h-1.5 min-w-0 gap-[3px]"
          >
            <span
              v-for="segment in segments"
              :key="segment.key"
              class="rounded-pill min-w-0"
              :class="segment.swatch"
              :style="{ flex: `${segment.weight} 1 0px` }"
            ></span>
            <span
              v-if="freeWeight > 0.005"
              class="rounded-pill bg-grid min-w-0"
              :style="{ flex: `${freeWeight} 1 0px` }"
            ></span>
            <span
              v-if="!segments.length && freeWeight <= 0.005"
              class="bg-grid rounded-pill flex-1"
            ></span>
          </div>
          <ul class="m-0 list-none p-0">
            <li
              v-for="entry in spendLegend"
              :key="entry.g.type"
              class="border-line grid min-h-10 grid-cols-[14px_minmax(0,1fr)_auto_52px] items-center gap-2.5 border-t"
            >
              <span
                class="size-2.5 rounded-[3px]"
                :class="entry.def.swatch"
                aria-hidden="true"
              ></span>
              <span class="text-[15px] font-bold">{{ entry.def.label }}</span>
              <span class="font-display text-[15px] font-semibold tabular-nums">
                {{ formatMoney(entry.g.total) }}
              </span>
              <span class="text-muted text-end text-[13px] font-bold">
                {{ shareText(entry.g.share) }}
              </span>
            </li>
            <li
              class="border-line grid min-h-10 grid-cols-[14px_minmax(0,1fr)_auto_52px] items-center gap-2.5 border-t"
            >
              <span
                class="bg-grid border-ctrl-line size-2.5 rounded-[3px] border"
                aria-hidden="true"
              ></span>
              <span class="text-[15px] font-bold">Sin destino</span>
              <span class="font-display text-[15px] font-semibold tabular-nums">
                {{ formatMoney(freeWeight) }}
              </span>
              <span class="text-muted text-end text-[13px] font-bold">{{
                shareText(freeShare)
              }}</span>
            </li>
          </ul>
          <div class="bg-panel2 grid gap-0.5 rounded-[18px] px-4 py-3.5">
            <span class="text-muted text-[14px] font-bold">{{ free.label }}</span>
            <span
              class="font-display text-[22px] font-semibold tracking-[-0.02em] tabular-nums"
              :class="free.tone === 'over' ? 'text-loss' : 'text-text'"
            >
              {{ formatMoney(figure.free) }}
            </span>
            <span class="text-muted text-[13px]">{{ free.note }}</span>
          </div>
          <label
            v-if="repeatText"
            class="text-soft flex min-h-11 cursor-pointer items-center gap-2.5 text-[14px] font-semibold"
          >
            <input v-model="repeat" type="checkbox" class="accent-accent m-0 size-[18px]" />
            {{ repeatText }}
          </label>
          <NeonButton variant="primary" @click="save">Guardar presupuesto</NeonButton>
          <p v-if="confirmation" role="status" class="text-[14px] font-bold">{{ confirmation }}</p>
        </aside>
      </div>
    </template>
  </div>
</template>
