<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'

import BaseButton from '../ui/BaseButton.vue'
import BaseInput from '../ui/BaseInput.vue'
import BaseSelect from '../ui/BaseSelect.vue'
import SegmentedControl, { type SegmentedOption } from '../ui/SegmentedControl.vue'
import SidePanel from '../ui/SidePanel.vue'
import { useMoneyFormatter } from '../../composables/useMoneyFormatter'
import { parseDecimal } from '../../lib/number'
import { computeInvestmentMovement } from '../../scripts/investment-movements'
import type { InvestmentSide, Transaction } from '../../scripts/types'
import { todayISO } from '../../scripts/utils'
import { useFinancialStateStore } from '../../stores/financial-state'
import { useInvestmentStore } from '../../stores/investment'
import { useStockEventsStore } from '../../stores/stockevents'

// Creates and edits an investment movement in the side panel. The same form
// serves both; only the title and the main action change.
const investmentStore = useInvestmentStore()
const stockEventsStore = useStockEventsStore()
const financialStateStore = useFinancialStateStore()
const { formatMoney } = useMoneyFormatter()

const SIDE_OPTIONS: SegmentedOption<InvestmentSide>[] = [
  { value: 'buy', label: 'Compra' },
  { value: 'sell', label: 'Venta' },
]

const emit = defineEmits<{ delete: [tx: Transaction] }>()

const open = ref(false)
const editing = ref<Transaction | null>(null)
const editingId = computed(() => editing.value?.id ?? null)
const form = reactive({
  side: 'buy' as InvestmentSide,
  symbol: '',
  category: '',
  accountId: '',
  units: '',
  unitPrice: '',
  fee: '0',
  movementCurrency: 'EUR',
  date: '',
  time: '',
  declared: false,
  toCash: false,
})

const isEditing = computed(() => editingId.value !== null)
const isBitvavo = computed(() => investmentStore.isBitvavoBrokerAccount(form.accountId))
const canSyncMovement = computed(() => stockEventsStore.canSyncSymbol(form.symbol))

const accountOptions = computed(() =>
  investmentStore.accounts.map((account) => ({ value: account.id, label: account.name })),
)
const categoryOptions = computed(() => {
  const names = isBitvavo.value
    ? ['Crypto']
    : Array.from(new Set([...investmentStore.investmentCategories, form.category])).filter(Boolean)
  return names.map((name) => ({ value: name, label: name }))
})

/** A typed number as the store expects it ("2110.3"), or '' when it is none. */
function asInput(text: string): string {
  const value = parseDecimal(text)
  return Number.isFinite(value) ? String(value) : ''
}

const movement = computed(() =>
  computeInvestmentMovement({
    side: form.side,
    symbol: form.symbol,
    units: parseDecimal(form.units) || 0,
    unitPrice: parseDecimal(form.unitPrice) || 0,
    fee: parseDecimal(form.fee) || 0,
  }),
)
const totalLabel = computed(() =>
  form.side === 'sell' ? 'Total de la venta' : 'Total de la compra',
)
const formula = computed(
  () =>
    `${form.units || '0'} × ${form.unitPrice || '0'} ${form.side === 'sell' ? '−' : '+'} ${form.fee || '0'}`,
)
const cashLabel = computed(() =>
  form.side === 'sell'
    ? 'Añadir al efectivo en Stock Events'
    : 'Descontar del efectivo en Stock Events',
)

// Bitvavo only holds crypto. Leaving it for another broker drops the forced
// "Crypto" for a real category, except when editing a movement saved so.
function syncCategoryForBroker(): void {
  if (isBitvavo.value) {
    form.category = 'Crypto'
    return
  }
  if (isEditing.value) return
  const names = investmentStore.investmentCategories
  if (form.category === 'Crypto' || !names.includes(form.category)) {
    form.category = names[0] ?? ''
  }
}

watch(() => form.accountId, syncCategoryForBroker)

const defaultToCash = (): boolean =>
  canSyncMovement.value && stockEventsStore.settings.tradesToCash === true
watch(defaultToCash, (toCash) => {
  if (!isEditing.value) form.toCash = toCash
})

function nowTime(): string {
  const now = new Date()
  return `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`
}

function resetAmounts(): void {
  form.symbol = ''
  form.units = ''
  form.unitPrice = ''
  form.fee = '0'
  form.declared = false
  form.toCash = defaultToCash()
}

function openNew(): void {
  editing.value = null
  form.date = form.date || todayISO()
  form.time = form.time || nowTime()
  form.movementCurrency =
    form.movementCurrency || (financialStateStore.currency || 'EUR').toUpperCase()
  if (!investmentStore.accounts.some((account) => account.id === form.accountId)) {
    form.accountId = investmentStore.accounts[0]?.id ?? ''
  }
  resetAmounts()
  syncCategoryForBroker()
  open.value = true
}

function openEdit(tx: Transaction): void {
  if (tx.remoteOperation) return
  editing.value = tx
  form.side = tx.side === 'sell' ? 'sell' : 'buy'
  form.symbol = tx.symbol || tx.category || ''
  form.category = tx.category || ''
  form.accountId = tx.accountId
  form.units = String(Number(tx.units) || 0)
  form.unitPrice = String(Number(tx.unitPrice) || 0)
  form.fee = String(Number(tx.fee) || 0)
  form.movementCurrency = (tx.movementCurrency || 'EUR').toUpperCase()
  form.date = String(tx.date)
  form.time = tx.time || '00:00'
  form.declared = Boolean(tx.declared)
  form.toCash = false
  open.value = true
}

function save(): void {
  const input = {
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
    declared: form.declared,
  }
  const saved = editingId.value
    ? investmentStore.saveEditedMovement(editingId.value, input)
    : investmentStore.addMovement({ ...input, toCash: form.toCash })
  if (saved) open.value = false
}

// On small screens the ledger hides its row actions: deleting starts here.
function requestDelete(): void {
  const tx = editing.value
  open.value = false
  if (tx) emit('delete', tx)
}

defineExpose({ openNew, openEdit })
</script>

<template>
  <SidePanel
    id="investment-movement-panel"
    v-model:open="open"
    kicker="Movimiento de inversión"
    :title="isEditing ? 'Editar movimiento' : 'Nuevo movimiento'"
    title-id="investment-movement-panel-title"
  >
    <form
      id="investment-movement-form"
      class="grid gap-6"
      autocomplete="off"
      @submit.prevent="save"
    >
      <SegmentedControl
        v-model="form.side"
        :options="SIDE_OPTIONS"
        label="Operación"
        variant="soft"
        data-key="investment-side"
        class="[&>button]:h-11 [&>button]:flex-1"
      />

      <fieldset class="grid gap-3.5 sm:grid-cols-2">
        <legend class="text-text-muted mb-3 text-xs font-bold tracking-widest uppercase">
          Activo
        </legend>
        <BaseInput
          id="investment-movement-symbol"
          v-model="form.symbol"
          label="Símbolo"
          name="symbol"
          maxlength="20"
          placeholder="VWCE"
          required
          class="[&_input]:font-mono"
        />
        <BaseSelect
          id="investment-movement-category"
          v-model="form.category"
          label="Categoría"
          name="category"
          :options="categoryOptions"
          :disabled="isBitvavo"
        />
        <BaseSelect
          id="investment-movement-broker"
          v-model="form.accountId"
          class="sm:col-span-2"
          label="Broker"
          name="accountId"
          :options="accountOptions"
          required
        />
      </fieldset>

      <fieldset class="grid grid-cols-2 gap-3.5 sm:grid-cols-[repeat(3,minmax(0,1fr))_5.75rem]">
        <legend class="text-text-muted mb-3 text-xs font-bold tracking-widest uppercase">
          Importe
        </legend>
        <BaseInput
          id="investment-movement-units"
          v-model="form.units"
          label="Títulos"
          name="units"
          inputmode="decimal"
          required
          class="[&_input]:font-display [&_input]:text-right"
        />
        <BaseInput
          id="investment-movement-unit-price"
          v-model="form.unitPrice"
          label="Precio (€)"
          name="unitPrice"
          inputmode="decimal"
          required
          class="[&_input]:font-display [&_input]:text-right"
        />
        <BaseInput
          id="investment-movement-fee"
          v-model="form.fee"
          label="Comisión (€)"
          name="fee"
          inputmode="decimal"
          required
          class="[&_input]:font-display [&_input]:text-right"
        />
        <BaseInput
          id="investment-movement-currency"
          v-model="form.movementCurrency"
          label="Moneda"
          name="movementCurrency"
          maxlength="3"
          required
          class="[&_input]:uppercase"
        />
        <div
          class="bg-ink border-ink-line text-ink-text col-span-full flex items-center justify-between gap-4 rounded-md border px-5 py-4"
        >
          <div class="grid gap-1">
            <span class="text-ink-muted text-sm">{{ totalLabel }}</span>
            <span class="font-display text-ink-text/80 text-sm tabular-nums">{{ formula }}</span>
          </div>
          <p
            id="investment-movement-total"
            class="font-display text-2xl font-medium tabular-nums"
            data-investment-total
          >
            {{ formatMoney(Math.abs(movement.signedAmount)) }}
          </p>
        </div>
      </fieldset>

      <fieldset class="grid grid-cols-2 gap-3.5">
        <legend class="text-text-muted mb-3 text-xs font-bold tracking-widest uppercase">
          Cuándo
        </legend>
        <BaseInput
          id="investment-movement-date"
          v-model="form.date"
          label="Fecha"
          name="date"
          type="date"
          required
        />
        <BaseInput
          id="investment-movement-time"
          v-model="form.time"
          label="Hora"
          name="time"
          type="time"
          required
        />
      </fieldset>

      <div class="border-line grid gap-1 border-t pt-3.5">
        <label class="flex min-h-11 items-center gap-3 text-[0.9375rem] font-medium">
          <input
            id="investment-movement-declared"
            v-model="form.declared"
            type="checkbox"
            name="declared"
            class="accent-primary size-4.5"
          />
          Ya está declarado
        </label>
        <label
          v-if="canSyncMovement && !isEditing"
          class="flex min-h-11 items-start gap-3 pt-2.5 text-[0.9375rem] font-medium"
        >
          <input
            id="investment-movement-to-cash"
            v-model="form.toCash"
            type="checkbox"
            name="toCash"
            class="accent-primary mt-0.5 size-4.5"
          />
          <span class="grid gap-0.5">
            {{ cashLabel }}
            <span class="text-text-muted text-sm font-normal">
              Se sincroniza con Stock Events al guardar.
            </span>
          </span>
        </label>
      </div>
    </form>

    <template #footer>
      <BaseButton v-if="isEditing" variant="danger" class="mr-auto" @click="requestDelete">
        Eliminar
      </BaseButton>
      <BaseButton variant="ghost" @click="open = false">Cancelar</BaseButton>
      <BaseButton variant="primary" type="submit" form="investment-movement-form">
        {{ isEditing ? 'Guardar cambios' : 'Guardar movimiento' }}
      </BaseButton>
    </template>
  </SidePanel>
</template>
