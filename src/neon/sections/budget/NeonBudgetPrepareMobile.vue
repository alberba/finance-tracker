<script setup lang="ts">
import { computed, ref } from 'vue'

import { formatMoney } from '../../../lib/format'
import { formatDecimalInput } from '../../../lib/number'
import NeonButton from '../../ui/NeonButton.vue'
import NeonDetailPanel from '../../ui/NeonDetailPanel.vue'
import NeonEmptyState from '../../ui/NeonEmptyState.vue'
import { useNeonBudgetScreens } from './budget-screens'
import NeonCents from './NeonCents.vue'
import { usePrepareSession } from './prepare-session'
import {
  barLabel,
  rowNote,
  shareText,
  showUseAverage,
  stepFor,
  stepValue,
  type PrepareGroup,
} from './prepare-view-model'

// «Hacer el presupuesto» in the mobile frame (artboard «Presupuesto · móvil ·
// Pixel 10», #434): what is left unassigned on top, where the values start
// from and what comes in as two rows, a card per group of spending that opens
// a sheet with its categories, and «Guardar» docked at the bottom. The values
// and the saving are the desktop screen's.
const screens = useNeonBudgetScreens()
const {
  target,
  groups,
  figure,
  free,
  start,
  drafts,
  repeat,
  confirmation,
  values,
  currentName,
  targetName,
  options,
  repeatText,
  groupTotal,
  pickStart,
  setValue,
  onInput,
  onBlur,
  save,
} = usePrepareSession()

const incomeGroup = computed(() => groups.value.find((group) => group.income) ?? null)
const spendGroups = computed(() => groups.value.filter((group) => !group.income))
const startLabel = computed(
  () => options.value.find((option) => option.mode === start.value)?.label,
)
const freeTone = computed(() => (free.value.tone === 'over' ? 'text-loss' : 'text-text'))
const segments = computed(() => [
  ...spendGroups.value
    .map((group) => ({
      key: group.type,
      weight: groupTotal(group.type)?.total ?? 0,
      swatch: group.swatch,
    }))
    .filter((segment) => segment.weight > 0),
  ...(figure.value.free > 0.005
    ? [{ key: 'free', weight: figure.value.free, swatch: 'bg-grid' }]
    : []),
])

// The sheet keeps the last group while it slides out.
const sheetType = ref<string | null>(null)
const sheetGroup = ref<PrepareGroup | null>(null)
const groupOpen = computed({
  get: () => sheetType.value !== null,
  set: (open) => {
    if (!open) sheetType.value = null
  },
})
const startOpen = ref(false)

function openGroup(group: PrepareGroup): void {
  sheetGroup.value = group
  sheetType.value = group.type
}

function pickStartAndClose(mode: Parameters<typeof pickStart>[0]): void {
  pickStart(mode)
  startOpen.value = false
}

const iconButton =
  'border-ctrl-line text-text outline-accent grid size-11 flex-none place-items-center rounded-full border focus-visible:outline-2 focus-visible:outline-offset-2 motion-safe:transition-transform motion-safe:duration-160 motion-safe:active:scale-[0.93]'
</script>

<template>
  <div class="grid min-w-0 content-start gap-4">
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
        class="font-display text-[22px] leading-[1.15] font-bold tracking-[-0.03em] outline-none"
      >
        Hacer el presupuesto
      </h1>
      <NeonEmptyState role="status">No hay un mes siguiente que preparar este año.</NeonEmptyState>
    </template>

    <template v-else>
      <h1
        id="budget-title"
        tabindex="-1"
        class="font-display text-[22px] leading-[1.15] font-bold tracking-[-0.03em] outline-none"
      >
        Presupuesto de {{ targetName }}
      </h1>

      <section aria-live="polite" class="grid gap-4">
        <div class="grid gap-0.5">
          <span class="text-muted text-[14px] font-bold">{{ free.label }}</span>
          <span
            class="font-display text-[38px] leading-[1.05] font-bold tracking-[-0.035em]"
            :class="freeTone"
          >
            <NeonCents :text="formatMoney(figure.free)" />
          </span>
          <span class="text-muted text-[14px]">de {{ formatMoney(figure.income) }} que entran</span>
        </div>
        <div
          role="img"
          :aria-label="barLabel(groups, figure)"
          class="bg-line rounded-pill flex h-1.5 min-w-0 gap-0.5 overflow-clip"
        >
          <span
            v-for="segment in segments"
            :key="segment.key"
            class="min-w-0"
            :class="segment.swatch"
            :style="{ flex: `${segment.weight} 1 0px` }"
          ></span>
        </div>
      </section>

      <div class="grid">
        <button
          type="button"
          class="text-text outline-accent border-line flex min-h-[52px] items-center justify-between gap-3 border-t text-start text-[15px] font-bold focus-visible:outline-2 focus-visible:-outline-offset-2"
          aria-haspopup="dialog"
          @click="startOpen = true"
        >
          <span
            >Partiendo de <b class="font-extrabold">{{ startLabel?.toLowerCase() }}</b></span
          >
          <svg
            class="text-muted size-[18px] flex-none"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
            aria-hidden="true"
          >
            <path d="M9 6l6 6-6 6" />
          </svg>
        </button>
        <button
          v-if="incomeGroup"
          type="button"
          class="text-text outline-accent border-line flex min-h-[52px] items-center justify-between gap-3 border-y text-start text-[15px] font-bold focus-visible:outline-2 focus-visible:-outline-offset-2"
          aria-haspopup="dialog"
          @click="openGroup(incomeGroup)"
        >
          <span>Entra este mes</span>
          <span class="flex items-center gap-2.5">
            <span class="font-display text-[15px] font-semibold">{{
              formatMoney(figure.income)
            }}</span>
            <svg
              class="text-muted size-[18px] flex-none"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
              aria-hidden="true"
            >
              <path d="M9 6l6 6-6 6" />
            </svg>
          </span>
        </button>
      </div>

      <ul class="grid gap-3">
        <li v-for="group in spendGroups" :key="group.type" class="grid">
          <button
            type="button"
            class="bg-panel border-line text-text outline-accent grid min-w-0 gap-3 rounded-[22px] border px-4 pt-4 pb-3.5 text-start focus-visible:outline-2 focus-visible:outline-offset-2 motion-safe:transition-transform motion-safe:duration-140 motion-safe:active:scale-[0.99]"
            aria-haspopup="dialog"
            :data-prepare-group="group.type"
            @click="openGroup(group)"
          >
            <span class="flex items-center justify-between gap-3">
              <span class="flex min-w-0 items-center gap-2.5 text-[16px] font-extrabold">
                <span
                  class="size-2.5 flex-none rounded-[3px]"
                  :class="group.swatch"
                  aria-hidden="true"
                ></span>
                {{ group.label }}
              </span>
              <span class="flex flex-none items-center gap-2.5">
                <span class="text-muted text-[13px] font-bold">{{
                  shareText(groupTotal(group.type)?.share ?? null)
                }}</span>
                <svg
                  class="text-muted size-[18px]"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  aria-hidden="true"
                >
                  <path d="M9 6l6 6-6 6" />
                </svg>
              </span>
            </span>
            <span class="font-display text-[22px] leading-[1.1] font-semibold tracking-[-0.02em]">
              {{ formatMoney(groupTotal(group.type)?.total ?? 0) }}
            </span>
            <span class="bg-line rounded-pill block h-1.5" aria-hidden="true">
              <span
                class="rounded-pill block h-full"
                :class="group.swatch"
                :style="{ width: `${groupTotal(group.type)?.share ?? 0}%` }"
              ></span>
            </span>
            <span class="text-muted truncate text-[13px]">
              {{
                group.rows.length
                  ? group.rows.map((row) => row.label).join(' · ')
                  : 'Sin categorías'
              }}
            </span>
          </button>
        </li>
      </ul>

      <label
        v-if="repeatText"
        class="text-soft border-line flex min-h-14 cursor-pointer items-center gap-3 border-t pbs-2 text-[15px] font-bold"
      >
        <input v-model="repeat" type="checkbox" class="accent-accent m-0 size-5" />
        {{ repeatText }}
      </label>

      <p v-if="confirmation" role="status" class="text-[14px] font-bold">{{ confirmation }}</p>

      <div
        data-bottom-dock
        class="bg-panel border-line shadow-float sticky bottom-[calc(92px+env(safe-area-inset-bottom,0px))] z-20 flex items-center gap-3 rounded-[20px] border py-2.5 ps-[18px] pe-3"
      >
        <div class="grid min-w-0 flex-1">
          <span class="text-muted text-[12px] font-bold">{{ free.label }}</span>
          <span class="font-display text-[20px] font-semibold tracking-[-0.02em]" :class="freeTone">
            {{ formatMoney(figure.free) }}
          </span>
        </div>
        <NeonButton variant="primary" @click="save">Guardar</NeonButton>
      </div>
    </template>
  </div>

  <NeonDetailPanel
    v-model:open="groupOpen"
    :title="sheetGroup?.label ?? ''"
    :kicker="`${formatMoney(groupTotal(sheetGroup?.type ?? 'expense')?.total ?? 0)} al mes`"
  >
    <ul v-if="sheetGroup" class="grid">
      <li
        v-for="row in sheetGroup.rows"
        :key="row.key"
        class="border-line grid gap-3 border-t py-3.5"
      >
        <span class="grid gap-0.5">
          <span class="flex items-baseline justify-between gap-3">
            <span class="text-[16px] font-bold">{{ row.label }}</span>
            <button
              v-if="showUseAverage(row, values[row.key] ?? 0)"
              type="button"
              :aria-label="`Usar la media de ${formatMoney(row.average)} en ${row.category}`"
              class="text-muted outline-accent min-h-11 flex-none text-[13px] font-bold underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2"
              @click="setValue(row.key, row.average ?? 0)"
            >
              Usar media
            </button>
          </span>
          <span class="text-muted text-[13px]">{{ rowNote(row, currentName) }}</span>
        </span>
        <span class="flex items-center gap-2.5">
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
          <label class="flex min-w-0 flex-1 items-center justify-center gap-1.5">
            <span class="sr-only">{{ row.category }} en {{ targetName }}, en euros</span>
            <input
              type="text"
              inputmode="decimal"
              :value="drafts[row.key] ?? formatDecimalInput(values[row.key] ?? 0)"
              class="bg-panel text-text outline-accent rounded-field font-display min-h-[46px] w-full min-w-0 border px-3.5 text-center text-base font-semibold tabular-nums focus-visible:outline-2 focus-visible:outline-offset-2"
              :class="row.key in drafts ? 'border-accent' : 'border-ctrl-line'"
              @input="onInput(row.key, $event)"
              @blur="onBlur(row.key)"
            />
            <span class="text-muted text-base" aria-hidden="true">€</span>
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
    <template #footer>
      <span class="me-auto grid ps-1">
        <span class="text-muted text-[12px] font-bold">{{ free.label }}</span>
        <span class="font-display text-[20px] font-semibold" :class="freeTone">{{
          formatMoney(figure.free)
        }}</span>
      </span>
      <NeonButton variant="primary" @click="groupOpen = false">Listo</NeonButton>
    </template>
  </NeonDetailPanel>

  <NeonDetailPanel v-model:open="startOpen" title="Partir de">
    <div class="grid">
      <button
        v-for="option in options"
        :key="option.mode"
        type="button"
        :aria-pressed="start === option.mode"
        class="text-text outline-accent border-line flex min-h-16 items-center justify-between gap-3 border-t text-start text-[16px] font-bold focus-visible:outline-2 focus-visible:-outline-offset-2"
        @click="pickStartAndClose(option.mode)"
      >
        <span>{{ option.label }}</span>
        <svg
          v-if="start === option.mode"
          class="text-accent-text size-[22px]"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
          aria-hidden="true"
        >
          <path d="M5 12.5l4.5 4.5L19 7.5" />
        </svg>
      </button>
    </div>
  </NeonDetailPanel>
</template>
