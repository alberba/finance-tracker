<script setup lang="ts">
import { storeToRefs } from 'pinia'
import { computed } from 'vue'

import { formatMoney, formatWholeAmount, splitDecimals } from '../../../lib/format'
import type { Month } from '../../../lib/month'
import type { SnapshotKind } from '../../../scripts/types'
import NeonButton from '../../ui/NeonButton.vue'
import { monthHistory } from './mobile-view-model'
import { useMonthClose } from './month-close'
import { GROUP_TITLE } from './view-model'
import { useNeonWealthScreens, type MonthsView } from './wealth-screens'

// «Balance por meses» in the mobile frame (artboard «Patrimonio · móvil ·
// Pixel 10»): the balance of the month on top, then either the form that
// closes it, one account per row, or «Cada mes», every month with its net
// worth. The same data and the same close as the desktop composition.
const screens = useNeonWealthScreens()
const { monthsView } = storeToRefs(screens)
const {
  year,
  viewModel,
  edit,
  totals,
  changes,
  valid,
  snapshotMonth,
  monthName,
  monthLower,
  previousName,
  status,
  groups,
  action,
  close,
  pick,
} = useMonthClose()

const net = computed(() => splitDecimals(formatMoney(totals.value.net)))
const netSize = computed(() => (net.value.whole.length > 7 ? 'text-[34px]' : 'text-[40px]'))
const history = computed(() => monthHistory(viewModel.value))
const COLUMNS: SnapshotKind[] = ['accounts', 'investments', 'liabilities']

const VIEWS: { value: MonthsView; label: string }[] = [
  { value: 'close', label: 'Cerrar mes' },
  { value: 'history', label: 'Historial' },
]

const SWATCH: Record<SnapshotKind, string> = {
  accounts: 'bg-faint',
  investments: 'bg-lilac',
  liabilities: 'bg-peach',
}

function open(month: Month): void {
  pick(month)
  monthsView.value = 'close'
}
</script>

<template>
  <div class="grid min-w-0 gap-5">
    <button
      type="button"
      class="text-text rounded-pill outline-accent -ms-2.5 inline-flex min-h-11 items-center gap-1.5 self-start ps-2.5 pe-4 text-sm font-extrabold underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2"
      @click="screens.go('home')"
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
      Patrimonio
    </button>

    <header class="grid gap-1.5">
      <p class="text-muted text-label tracking-label font-extrabold uppercase">
        Balance patrimonial · {{ year }}
      </p>
      <h1
        id="wealth-title"
        tabindex="-1"
        class="font-display text-h1 tracking-h1 leading-[1.1] font-bold outline-none"
      >
        Balance por meses
      </h1>
      <p class="text-soft text-[15px]">
        Apunta cada mes el saldo real de tus cuentas, inversiones y deudas.
      </p>
    </header>

    <section
      aria-label="Ecuación del balance"
      class="border-line grid gap-3 border-y py-4"
      data-wealth-equation
    >
      <div class="flex items-baseline justify-between gap-3">
        <span class="text-muted text-label tracking-label font-extrabold uppercase"
          >Patrimonio</span
        >
        <span
          class="text-soft text-label tracking-label flex items-center gap-2 font-extrabold whitespace-nowrap uppercase"
          data-wealth-status
        >
          <span
            class="size-2 rounded-full border-[1.5px]"
            :class="status.closed ? 'border-text bg-text' : 'border-muted'"
            aria-hidden="true"
          ></span>
          {{ status.text }}
        </span>
      </div>
      <p
        class="font-display leading-[1.05] font-bold tracking-[-0.04em] whitespace-nowrap tabular-nums"
        :class="netSize"
        data-wealth-net
      >
        {{ net.whole
        }}<span v-if="net.rest" class="text-muted text-[0.42em] tracking-[-0.02em]">{{
          net.rest
        }}</span>
      </p>
      <dl class="grid grid-cols-3">
        <div
          v-for="(kind, index) in COLUMNS"
          :key="kind"
          class="grid min-w-0 gap-0.5"
          :class="index > 0 && 'ps-3.5 shadow-[inset_1px_0_0_var(--color-line)]'"
        >
          <dt class="text-soft text-note">{{ GROUP_TITLE[kind] }}</dt>
          <dd class="font-display text-[16px] font-semibold tabular-nums">
            {{ formatWholeAmount(totals[kind]) }}&nbsp;€
          </dd>
        </div>
      </dl>
    </section>

    <div
      role="group"
      aria-label="Vista"
      class="bg-panel2 rounded-pill mx-auto flex gap-[3px] p-[3px]"
    >
      <button
        v-for="option in VIEWS"
        :key="option.value"
        type="button"
        :aria-pressed="monthsView === option.value"
        class="rounded-pill outline-accent text-note min-h-9 px-3 font-extrabold focus-visible:outline-2 focus-visible:outline-offset-2 pointer-coarse:min-h-11"
        :class="monthsView === option.value ? 'bg-sel-bg text-sel-text' : 'text-soft'"
        @click="monthsView = option.value"
      >
        {{ option.label }}
      </button>
    </div>

    <template v-if="monthsView === 'close'">
      <section
        aria-labelledby="wealth-close-title"
        class="bg-panel border-line rounded-card grid min-w-0 gap-1 border px-3 py-4"
      >
        <h2 id="wealth-close-title" class="text-block-title font-extrabold">
          Saldos de {{ monthLower }}
        </h2>
        <p class="text-soft text-note">
          Lo que dejes vacío toma el saldo calculado con tus movimientos.
        </p>
        <div v-for="group in groups" :key="group.kind" :data-ledger-group="group.kind">
          <div class="border-line flex items-baseline justify-between gap-3 border-t pt-5 pb-1.5">
            <span class="flex items-center gap-2.5 text-[18px] font-extrabold">
              <span
                class="size-2 flex-none rounded-[2px]"
                :class="SWATCH[group.kind]"
                aria-hidden="true"
              ></span>
              {{ group.title }}
            </span>
            <span class="text-soft text-meta whitespace-nowrap">
              {{ group.count }} · {{ formatMoney(totals[group.kind]) }}
            </span>
          </div>
          <label
            v-for="row in group.rows"
            :key="row.id"
            class="border-line flex min-h-16 items-center gap-3 border-t py-2"
          >
            <span class="grid min-w-0 flex-1 gap-0.5">
              <span class="flex min-w-0 items-center gap-2.5">
                <span
                  class="size-2 flex-none rounded-[2px]"
                  :class="SWATCH[group.kind]"
                  aria-hidden="true"
                ></span>
                <span class="truncate text-[16px] font-bold">{{ row.name }}</span>
              </span>
              <span class="text-muted text-meta truncate ps-[18px] tabular-nums">
                {{ previousName }} {{ row.prev }}
              </span>
            </span>
            <span class="flex flex-none items-baseline gap-1.5">
              <input
                type="text"
                inputmode="decimal"
                autocomplete="off"
                :aria-label="row.aria"
                :placeholder="row.placeholder"
                :value="edit.field(row.kind, row.id)?.text ?? ''"
                :aria-invalid="edit.field(row.kind, row.id)?.invalid ?? false"
                class="rounded-field bg-panel font-display placeholder:text-muted outline-accent min-h-[46px] w-[clamp(112px,38cqi,150px)] border px-3.5 text-end text-[16px] font-semibold tabular-nums focus-visible:outline-2 focus-visible:outline-offset-2 motion-safe:transition-[border-color] motion-safe:duration-160"
                :class="[
                  edit.field(row.kind, row.id)?.edited ? 'border-accent' : 'border-ctrl-line',
                  edit.field(row.kind, row.id)?.invalid ? 'text-loss' : 'text-text',
                ]"
                @input="edit.set(row.kind, row.id, ($event.target as HTMLInputElement).value)"
              />
              <span class="font-display text-muted text-[16px]" aria-hidden="true">€</span>
            </span>
          </label>
        </div>
        <div class="border-line mt-3 grid gap-2.5 border-t pt-3.5">
          <div class="flex items-center justify-between gap-3">
            <span
              class="text-note min-w-0"
              :class="valid ? 'text-soft' : 'text-loss'"
              role="status"
              data-close-status
              >{{ action.text }}</span
            >
            <NeonButton v-if="changes > 0" class="flex-none" @click="edit.discard">
              Descartar
            </NeonButton>
          </div>
          <NeonButton variant="primary" class="w-full" :disabled="action.locked" @click="close">
            {{ action.label }}
          </NeonButton>
        </div>
      </section>
    </template>

    <section
      v-else
      aria-labelledby="wealth-history-title"
      class="bg-panel border-line rounded-card grid min-w-0 gap-1 border px-3 py-4"
    >
      <h2 id="wealth-history-title" class="text-block-title font-extrabold">Cada mes</h2>
      <p class="text-soft text-note pbe-1.5">Pulsa un mes para abrir su saldo.</p>
      <ul>
        <li v-for="entry in history" :key="entry.month">
          <button
            type="button"
            :aria-current="entry.month === snapshotMonth ? 'date' : undefined"
            :aria-label="entry.aria"
            class="border-line text-text outline-accent grid min-h-16 w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 border-t py-3 text-start focus-visible:outline-2 focus-visible:-outline-offset-2"
            @click="open(entry.month)"
          >
            <span class="flex min-w-0 items-center gap-2.5 text-[16px] font-extrabold">
              <span
                class="size-2 flex-none rounded-full border-[1.5px]"
                :class="entry.closed ? 'border-text bg-text' : 'border-muted'"
                aria-hidden="true"
              ></span>
              {{ entry.label }}
            </span>
            <span
              class="font-display text-end text-[15px] font-semibold whitespace-nowrap tabular-nums"
              >{{ entry.net }}</span
            >
            <span class="text-muted text-meta col-span-full ps-[18px]">{{ entry.summary }}</span>
          </button>
        </li>
      </ul>
    </section>
  </div>
</template>
