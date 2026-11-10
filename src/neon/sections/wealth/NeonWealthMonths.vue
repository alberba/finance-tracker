<script setup lang="ts">
import { storeToRefs } from 'pinia'
import { computed } from 'vue'

import { useSnapshotEdit } from '../../../composables/useSnapshotEdit'
import { useToast } from '../../../composables/useToast'
import { formatMoney, formatMonthName } from '../../../lib/format'
import type { Month } from '../../../lib/month'
import type { SnapshotKind } from '../../../scripts/types'
import { useFinancialStateStore } from '../../../stores/financial-state'
import { useWealthStore } from '../../../stores/wealth'
import NeonButton from '../../ui/NeonButton.vue'
import NeonWealthEquation from './NeonWealthEquation.vue'
import NeonWealthMonthTable from './NeonWealthMonthTable.vue'
import { closeAction, closeStatus, closingEdits, ledgerGroups, monthTable } from './view-model'
import { useNeonWealthScreens } from './wealth-screens'

// «Balance por meses»: close a month by writing down the real balance of
// each account (an empty field keeps the calculated one), next to every
// account at the close of each month. A month in the table opens it here.
const financialStateStore = useFinancialStateStore()
const wealthStore = useWealthStore()
const screens = useNeonWealthScreens()
const { viewModel, snapshotMonth } = storeToRefs(wealthStore)
const { showToast } = useToast()

const edit = useSnapshotEdit({
  groups: computed(() => viewModel.value.groups),
  context: computed(() => `${financialStateStore.year}:${snapshotMonth.value}`),
  commit: () => undefined,
})
const { totals, changes, valid } = edit

const monthName = computed(() => formatMonthName(snapshotMonth.value))
const monthLower = computed(() => monthName.value.toLowerCase())
const previousName = computed(() => {
  const index = viewModel.value.history.months.indexOf(snapshotMonth.value)
  return index > 0 ? formatMonthName(viewModel.value.history.months[index - 1]) : '—'
})
const status = computed(() => closeStatus(viewModel.value, snapshotMonth.value))
const groups = computed(() => ledgerGroups(viewModel.value, snapshotMonth.value))
const action = computed(() =>
  closeAction({
    month: snapshotMonth.value,
    closed: status.value.closed,
    changes: changes.value,
    invalid: !valid.value,
  }),
)
const table = computed(() => monthTable(viewModel.value))

const SWATCH: Record<SnapshotKind, string> = {
  accounts: 'bg-faint',
  investments: 'bg-lilac',
  liabilities: 'bg-peach',
}

function close(): void {
  if (action.value.locked) return
  const edits = closingEdits(viewModel.value.groups, edit.field)
  if (!edits) return
  const wasClosed = status.value.closed
  wealthStore.saveSnapshot(edits, { notify: false })
  edit.discard()
  showToast(wasClosed ? `Cambios de ${monthLower.value} guardados.` : `${monthName.value} cerrado.`)
}

function pick(month: Month): void {
  wealthStore.setMonth(month)
}
</script>

<template>
  <div class="grid min-w-0 gap-6">
    <button
      type="button"
      class="text-text rounded-pill outline-accent -ms-2.5 inline-flex min-h-11 items-center gap-1.5 self-start ps-2.5 pe-4 text-sm font-extrabold underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2"
      @click="screens.go('home')"
    >
      <svg
        width="18"
        height="18"
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
      Patrimonio
    </button>

    <header class="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
      <div class="grid min-w-0 gap-1">
        <p class="text-muted text-label tracking-label font-extrabold uppercase">
          Balance patrimonial · {{ financialStateStore.year }}
        </p>
        <h1
          id="wealth-title"
          tabindex="-1"
          class="font-display text-[clamp(30px,3.2cqi,44px)] leading-[1.1] font-bold tracking-[-0.03em] outline-none"
        >
          Balance por meses
        </h1>
      </div>
      <p class="text-soft max-w-[44ch] text-[16px]">
        Apunta cada mes el saldo real de tus cuentas, inversiones y deudas.
      </p>
    </header>

    <NeonWealthEquation :totals="totals" :status="status" />

    <div
      class="grid min-w-0 grid-cols-1 items-stretch gap-8 @min-[1300px]:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]"
    >
      <section
        aria-labelledby="wealth-close-title"
        class="bg-panel border-line rounded-card flex min-w-0 flex-col border px-6 py-[22px] @max-lg:px-3 @max-lg:py-4"
      >
        <h2 id="wealth-close-title" class="text-block-title font-extrabold">
          Cerrar {{ monthLower }}
        </h2>
        <p class="text-soft mt-3 text-[16px]">
          Lo que dejes vacío toma el saldo calculado con tus movimientos.
        </p>
        <div
          class="text-muted text-label tracking-label mt-5 grid grid-cols-[minmax(0,1fr)_120px_160px] items-end gap-4 font-extrabold uppercase @max-lg:hidden"
          aria-hidden="true"
        >
          <span>Cuenta o activo</span>
          <span class="text-end">{{ previousName }}</span>
          <span class="text-end">{{ monthName }}</span>
        </div>
        <div v-for="group in groups" :key="group.kind" :data-ledger-group="group.kind">
          <div class="border-line flex items-baseline justify-between gap-3 border-t pt-5 pb-2">
            <span class="flex items-center gap-2.5 text-[18px] font-extrabold">
              <span
                class="size-2 flex-none rounded-[2px]"
                :class="SWATCH[group.kind]"
                aria-hidden="true"
              ></span>
              {{ group.title }}
            </span>
            <span class="text-muted text-note whitespace-nowrap">
              {{ group.count }} · {{ formatMoney(totals[group.kind]) }}
            </span>
          </div>
          <div
            v-for="row in group.rows"
            :key="row.id"
            class="border-line grid min-h-16 grid-cols-[minmax(0,1fr)_120px_160px] items-center gap-4 border-t @max-lg:grid-cols-[minmax(0,1fr)_140px] @max-lg:gap-x-3 @max-lg:py-1.5"
          >
            <span class="flex min-w-0 items-center gap-2.5">
              <span
                class="size-2 flex-none rounded-[2px]"
                :class="SWATCH[group.kind]"
                aria-hidden="true"
              ></span>
              <span class="grid min-w-0 gap-px">
                <span class="truncate font-bold">{{ row.name }}</span>
                <span class="text-muted text-meta truncate tabular-nums @min-lg:hidden">
                  {{ previousName }} {{ row.prev }}
                </span>
              </span>
            </span>
            <span
              class="font-display text-muted text-end text-[16px] font-semibold whitespace-nowrap @max-lg:hidden"
            >
              {{ row.prev }}
            </span>
            <label class="flex min-w-0 items-baseline justify-end gap-1.5">
              <input
                type="text"
                inputmode="decimal"
                autocomplete="off"
                :aria-label="row.aria"
                :placeholder="row.placeholder"
                :value="edit.field(row.kind, row.id)?.text ?? ''"
                :aria-invalid="edit.field(row.kind, row.id)?.invalid ?? false"
                class="rounded-field bg-panel font-display placeholder:text-muted outline-accent min-h-[46px] w-full min-w-0 border px-3.5 text-end text-[16px] font-semibold tabular-nums focus-visible:outline-2 focus-visible:outline-offset-2 motion-safe:transition-[border-color] motion-safe:duration-160"
                :class="[
                  edit.field(row.kind, row.id)?.edited ? 'border-accent' : 'border-ctrl-line',
                  edit.field(row.kind, row.id)?.invalid ? 'text-loss' : 'text-text',
                ]"
                @input="edit.set(row.kind, row.id, ($event.target as HTMLInputElement).value)"
              />
              <span class="font-display text-muted text-[16px]" aria-hidden="true">€</span>
            </label>
          </div>
        </div>
        <div
          class="border-line mt-auto flex flex-wrap items-center justify-between gap-x-[18px] gap-y-3.5 border-t pt-[18px]"
        >
          <span
            class="text-note"
            :class="valid ? 'text-muted' : 'text-loss'"
            role="status"
            data-close-status
            >{{ action.text }}</span
          >
          <div class="flex items-center gap-2.5">
            <NeonButton v-if="changes > 0" @click="edit.discard">Descartar</NeonButton>
            <NeonButton variant="primary" :disabled="action.locked" @click="close">
              {{ action.label }}
            </NeonButton>
          </div>
        </div>
      </section>

      <NeonWealthMonthTable :table="table" :month="snapshotMonth" @pick="pick" />
    </div>
  </div>
</template>
