<script setup lang="ts">
import { computed, reactive, watch } from 'vue'

import type { InvestmentEntryPreset } from '../../composables/useEntrySheet'

import { useMoneyFormatter } from '../../composables/useMoneyFormatter'
import { parseDecimal } from '../../lib/number'
import { computeInvestmentMovement } from '../../scripts/investment-movements'
import type { InvestmentSide } from '../../scripts/types'
import { todayISO } from '../../scripts/utils'
import { useFinancialStateStore } from '../../stores/financial-state'
import { useInvestmentStore } from '../../stores/investment'
import { useStockEventsStore } from '../../stores/stockevents'
import NeonSwitch from '../ui/NeonSwitch.vue'
import { categoryIcon } from '../ui/category-icons'
import { ACCOUNT_ICON, ENTRY_FIELD_CLASS, ENTRY_LABEL_CLASS } from './entry-types'
import NeonEntryDatePicker from './NeonEntryDatePicker.vue'
import NeonEntryPicker from './NeonEntryPicker.vue'

// A new investment from Inversión: a purchase or a sale of a symbol, with the
// fields Inversión › Movimientos keeps (broker, category, units, price, fee,
// currency, date and time). The sheet mounts it afresh on every opening and
// calls `save()` on submit. Opened from an asset's Comprar / Vender, it starts
// on that operation and that asset.
const props = defineProps<{ preset?: InvestmentEntryPreset | null }>()

const investmentStore = useInvestmentStore()
const stockEventsStore = useStockEventsStore()
const financialStateStore = useFinancialStateStore()
const { formatMoney } = useMoneyFormatter()

const SIDES: ReadonlyArray<{ value: InvestmentSide; label: string }> = [
  { value: 'buy', label: 'Compra' },
  { value: 'sell', label: 'Venta' },
]

function nowTime(): string {
  const now = new Date()
  return `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`
}

/** The id when it is an investment account still offered for new movements. */
function activeInvestmentAccountId(id: string | undefined): string | undefined {
  return financialStateStore.activeInvestmentAssets.find((asset) => asset.id === id)?.id
}

const form = reactive({
  side: (props.preset?.side ?? 'buy') as InvestmentSide,
  symbol: props.preset?.symbol ?? '',
  category: props.preset?.category ?? '',
  accountId:
    investmentStore.accounts.find((account) => account.id === props.preset?.accountId)?.id ??
    investmentStore.accounts[0]?.id ??
    '',
  investmentAccountId:
    activeInvestmentAccountId(props.preset?.destinationAccountId) ??
    activeInvestmentAccountId(
      props.preset?.symbol
        ? investmentStore.defaultInvestmentAccountId(props.preset.symbol)
        : undefined,
    ) ??
    financialStateStore.activeInvestmentAssets[0]?.id ??
    '',
  units: '',
  unitPrice: '',
  fee: '',
  movementCurrency: (props.preset?.currency || financialStateStore.currency || 'EUR').toUpperCase(),
  date: todayISO(),
  time: nowTime(),
  declared: false,
  toCash: false,
})

// The investment account follows the instrument of the typed symbol until the
// user picks one; a symbol with no instrument leaves what was there.
let investmentAccountPicked = false
watch(
  () => form.symbol,
  (symbol) => {
    if (investmentAccountPicked) return
    const account = activeInvestmentAccountId(investmentStore.defaultInvestmentAccountId(symbol))
    if (account) form.investmentAccountId = account
  },
)
function pickInvestmentAccount(accountId: string): void {
  investmentAccountPicked = true
  form.investmentAccountId = accountId
}

const isBitvavo = computed(() => investmentStore.isBitvavoBrokerAccount(form.accountId))
const canSync = computed(() => stockEventsStore.canSyncSymbol(form.symbol))

const brokerOptions = computed(() =>
  investmentStore.accounts.map((account) => ({ value: account.id, label: account.name })),
)
const investmentAccountOptions = computed(() =>
  financialStateStore.activeInvestmentAssets.map((asset) => ({
    value: asset.id,
    label: asset.name,
  })),
)
const categoryOptions = computed(() =>
  (isBitvavo.value ? ['Crypto'] : investmentStore.investmentCategories).map((name) => ({
    value: name,
    label: name,
    icon: categoryIcon('investment', name),
  })),
)

// Bitvavo only holds crypto; leaving it goes back to a real category.
watch(
  () => form.accountId,
  () => {
    if (isBitvavo.value) {
      form.category = 'Crypto'
      return
    }
    const names = investmentStore.investmentCategories
    if (!names.includes(form.category)) form.category = names[0] ?? ''
  },
  { immediate: true },
)

watch(
  () => canSync.value && stockEventsStore.settings.tradesToCash === true,
  (toCash) => (form.toCash = toCash),
  { immediate: true },
)

const movement = computed(() =>
  computeInvestmentMovement({
    side: form.side,
    symbol: form.symbol,
    units: parseDecimal(form.units) || 0,
    unitPrice: parseDecimal(form.unitPrice) || 0,
    fee: parseDecimal(form.fee) || 0,
  }),
)
const selling = computed(() => form.side === 'sell')
const cashLabel = computed(() =>
  selling.value ? 'Añadir al efectivo en Stock Events' : 'Descontar del efectivo en Stock Events',
)

/** A typed number as the store expects it ("2110.3"), or '' when it is none. */
function asInput(text: string): string {
  const value = parseDecimal(text)
  return Number.isFinite(value) ? String(value) : ''
}

/** Saves the operation; the store says what is missing when it cannot. */
function save(): boolean {
  return investmentStore.addMovement({
    date: form.date,
    time: form.time,
    side: form.side,
    symbol: form.symbol,
    category: form.category,
    unitPrice: asInput(form.unitPrice),
    units: asInput(form.units),
    fee: asInput(form.fee) || '0',
    movementCurrency: form.movementCurrency,
    accountId: form.accountId,
    destinationAccountId: form.investmentAccountId || undefined,
    declared: form.declared,
    toCash: canSync.value && form.toCash,
  })
}

defineExpose({ save, selling })

const numberClass = `${ENTRY_FIELD_CLASS} font-display text-end tabular-nums`
</script>

<template>
  <div class="bg-bg rounded-field flex gap-1 p-1" role="radiogroup" aria-label="Operación">
    <button
      v-for="option in SIDES"
      :key="option.value"
      type="button"
      role="radio"
      :aria-checked="form.side === option.value"
      class="min-h-11 flex-1 rounded-lg px-2 text-[14px] font-extrabold underline-offset-4 focus-visible:underline focus-visible:outline-2 focus-visible:outline-transparent active:brightness-90 motion-safe:transition-colors motion-safe:duration-160"
      :class="form.side === option.value ? 'bg-accent/12 text-text' : 'text-soft'"
      @click="form.side = option.value"
    >
      {{ option.label }}
    </button>
  </div>

  <div class="grid grid-cols-[minmax(0,1fr)_5.5rem] gap-2">
    <label :class="ENTRY_LABEL_CLASS">
      Símbolo
      <input
        v-model="form.symbol"
        name="symbol"
        maxlength="20"
        placeholder="VWCE"
        autocapitalize="characters"
        spellcheck="false"
        :class="[ENTRY_FIELD_CLASS, 'placeholder:text-faint uppercase']"
      />
    </label>
    <label :class="ENTRY_LABEL_CLASS">
      Moneda
      <input
        v-model="form.movementCurrency"
        name="movementCurrency"
        maxlength="3"
        autocapitalize="characters"
        spellcheck="false"
        :class="[ENTRY_FIELD_CLASS, 'uppercase']"
      />
    </label>
  </div>

  <div class="grid grid-cols-3 gap-2">
    <label :class="ENTRY_LABEL_CLASS">
      Títulos
      <input
        v-model="form.units"
        name="units"
        inputmode="decimal"
        placeholder="0"
        :class="[numberClass, 'placeholder:text-faint']"
      />
    </label>
    <label :class="ENTRY_LABEL_CLASS">
      Precio
      <input
        v-model="form.unitPrice"
        name="unitPrice"
        inputmode="decimal"
        placeholder="0,00"
        :class="[numberClass, 'placeholder:text-faint']"
      />
    </label>
    <label :class="ENTRY_LABEL_CLASS">
      Comisión
      <input
        v-model="form.fee"
        name="fee"
        inputmode="decimal"
        placeholder="0,00"
        :class="[numberClass, 'placeholder:text-faint']"
      />
    </label>
  </div>

  <div class="bg-bg rounded-field flex items-center justify-between gap-3 px-3 py-2.5">
    <span class="text-muted min-w-0 text-[13px] font-bold">
      {{ selling ? 'Total de la venta' : 'Total de la compra' }}
    </span>
    <output
      class="font-display shrink-0 text-[24px] leading-tight font-bold tracking-tight tabular-nums"
      aria-live="polite"
      data-investment-total
    >
      {{ formatMoney(Math.abs(movement.signedAmount)) }}
    </output>
  </div>

  <NeonEntryPicker
    v-model="form.accountId"
    :icon="ACCOUNT_ICON"
    label="Broker"
    :options="brokerOptions"
  />
  <NeonEntryPicker
    :model-value="form.investmentAccountId"
    :icon="ACCOUNT_ICON"
    label="Cuenta de inversión"
    :options="investmentAccountOptions"
    @update:model-value="pickInvestmentAccount"
  />
  <NeonEntryPicker
    v-model="form.category"
    label="Categoría"
    :icon="categoryIcon('investment', form.category)"
    :options="categoryOptions"
  />

  <div class="grid grid-cols-2 items-end gap-2">
    <NeonEntryDatePicker v-model="form.date" />
    <label :class="ENTRY_LABEL_CLASS">
      Hora
      <input
        v-model="form.time"
        name="time"
        type="time"
        :class="[ENTRY_FIELD_CLASS, 'tabular-nums']"
      />
    </label>
  </div>

  <div class="divide-line grid divide-y">
    <div v-if="canSync" class="flex min-h-11 items-center justify-between gap-4 py-1.5">
      <span class="grid gap-0.5 text-[14px] font-bold">
        {{ cashLabel }}
        <span class="text-muted text-[12px]">Se sincroniza con Stock Events al guardar.</span>
      </span>
      <NeonSwitch v-model="form.toCash" :label="cashLabel" />
    </div>
  </div>
</template>
