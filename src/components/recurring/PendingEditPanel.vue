<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'

import BaseButton from '../ui/BaseButton.vue'
import BaseInput from '../ui/BaseInput.vue'
import BaseSelect from '../ui/BaseSelect.vue'
import SegmentedControl from '../ui/SegmentedControl.vue'
import SidePanel from '../ui/SidePanel.vue'
import { TYPE_OPTIONS, categorySelectOptions } from '../transactions/transaction-types'
import { getCategoriesForType } from '../../domain/transactions/categories'
import { useMoneyFormatter } from '../../composables/useMoneyFormatter'
import { parseDecimal, round2 } from '../../lib/number'
import type { InvestmentSide, PendingMovement, TransactionType } from '../../scripts/types'
import { useFinancialStateStore } from '../../stores/financial-state'
import { useRecurringStore } from '../../stores/recurring'

// Edits a pending movement before it is confirmed. An investment pending
// movement also carries its operation (symbol, units, price, fees).
const recurringStore = useRecurringStore()
const financialStateStore = useFinancialStateStore()
const { formatMoney } = useMoneyFormatter()

const open = ref(false)
const editingId = ref('')
const draft = reactive({
  type: 'expense' as TransactionType,
  date: '',
  accountId: '',
  destinationAccountId: '',
  category: '',
  description: '',
  amount: '',
  symbol: '',
  side: 'buy' as InvestmentSide,
  units: '',
  unitPrice: '',
  fee: '',
  time: '',
})

const isInvestment = computed(() => draft.type === 'investment')
const isSaving = computed(() => draft.type === 'saving')
// A saving never lands in the account it leaves.
const destinationAccounts = computed(() =>
  financialStateStore.accounts.filter((account) => account.id !== draft.accountId),
)
const investmentTotal = computed(() =>
  round2(
    (parseDecimal(draft.units) || 0) * (parseDecimal(draft.unitPrice) || 0) +
      (parseDecimal(draft.fee) || 0),
  ),
)

const categories = computed(() => getCategoriesForType(financialStateStore.state, draft.type))
const categoryOptions = computed(() => categorySelectOptions(categories.value, draft.category))
const sideOptions = [
  { value: 'buy' as const, label: 'Compra' },
  { value: 'sell' as const, label: 'Venta' },
]

let initializing = false

watch(
  () => draft.type,
  (type, previous) => {
    if (initializing) return
    if (!categories.value.includes(draft.category)) draft.category = categories.value[0] || ''
    const assets = financialStateStore.investmentAssets
    const accounts = financialStateStore.accounts
    if (type === 'investment') {
      const known = [...assets, ...accounts].some((item) => item.id === draft.accountId)
      if (!known) draft.accountId = assets[0]?.id || accounts[0]?.id || ''
      return
    }
    if (previous === 'investment' && investmentTotal.value > 0) {
      draft.amount = String(investmentTotal.value)
    }
    if (assets.some((asset) => asset.id === draft.accountId) && accounts[0]) {
      draft.accountId = accounts[0].id
    }
    ensureDestination()
  },
)
watch(() => draft.accountId, ensureDestination)

// Keeps a saving's destination set and different from the origin.
function ensureDestination(): void {
  if (initializing || !isSaving.value) return
  if (!destinationAccounts.value.some((account) => account.id === draft.destinationAccountId)) {
    draft.destinationAccountId = destinationAccounts.value[0]?.id ?? ''
  }
}

function openFor(item: PendingMovement): void {
  initializing = true
  editingId.value = item.id
  draft.type = item.type || 'expense'
  draft.date = item.occurrenceDate
  draft.accountId = item.accountId
  draft.destinationAccountId = item.destinationAccountId || ''
  draft.category = item.category
  draft.description = item.description
  draft.amount = String(item.amount)
  draft.symbol = item.symbol || ''
  draft.side = item.side || 'buy'
  draft.units = String(item.units ?? 0)
  draft.unitPrice = String(item.unitPrice ?? 0)
  draft.fee = String(item.fee ?? 0)
  draft.time = item.time || ''
  open.value = true
  queueMicrotask(() => {
    initializing = false
  })
}

function save(): void {
  const saved = recurringStore.editPending(editingId.value, {
    type: draft.type,
    date: draft.date,
    accountId: draft.accountId,
    destinationAccountId: draft.destinationAccountId,
    category: draft.category,
    description: draft.description,
    amount: parseDecimal(draft.amount) || 0,
    symbol: draft.symbol,
    side: draft.side,
    units: parseDecimal(draft.units) || 0,
    unitPrice: parseDecimal(draft.unitPrice) || 0,
    fee: parseDecimal(draft.fee) || 0,
    time: draft.time,
  })
  if (saved) open.value = false
}

defineExpose({ openFor })
</script>

<template>
  <SidePanel
    id="pending-edit-panel"
    v-model:open="open"
    kicker="Pendiente"
    title="Editar antes de confirmar"
    title-id="pending-edit-title"
  >
    <form id="pending-edit-form" class="grid gap-6" @submit.prevent="save">
      <SegmentedControl
        v-model="draft.type"
        :options="TYPE_OPTIONS"
        label="Tipo de movimiento"
        variant="soft"
        data-key="pending-type"
        class="[&>button]:h-11 [&>button]:flex-1"
      />

      <fieldset class="grid gap-3.5 sm:grid-cols-2">
        <legend class="text-text-muted mb-3 text-xs font-bold tracking-widest uppercase">
          Detalle
        </legend>
        <BaseInput v-model="draft.description" class="sm:col-span-2" label="Descripción" required />
        <BaseInput v-model="draft.date" label="Fecha" type="date" required />
        <BaseSelect
          v-model="draft.accountId"
          :label="isSaving ? 'Cuenta origen' : 'Cuenta'"
          required
        >
          <template v-if="isInvestment">
            <optgroup
              v-if="financialStateStore.investmentAssets.length"
              label="Activos de inversión"
            >
              <option
                v-for="asset in financialStateStore.investmentAssets"
                :key="asset.id"
                :value="asset.id"
              >
                {{ asset.name }}
              </option>
            </optgroup>
            <optgroup v-if="financialStateStore.accounts.length" label="Cuentas de efectivo">
              <option
                v-for="account in financialStateStore.accounts"
                :key="account.id"
                :value="account.id"
              >
                {{ account.name }}
              </option>
            </optgroup>
          </template>
          <template v-else>
            <option
              v-for="account in financialStateStore.accounts"
              :key="account.id"
              :value="account.id"
            >
              {{ account.name }}
            </option>
          </template>
        </BaseSelect>
        <BaseSelect
          v-if="isSaving"
          v-model="draft.destinationAccountId"
          label="Cuenta destino"
          required
        >
          <option v-for="account in destinationAccounts" :key="account.id" :value="account.id">
            {{ account.name }}
          </option>
        </BaseSelect>
        <BaseSelect
          v-model="draft.category"
          label="Categoría"
          :options="categoryOptions"
          required
        />
        <BaseInput
          v-if="!isInvestment"
          v-model="draft.amount"
          label="Importe"
          suffix="€"
          inputmode="decimal"
          required
        />
      </fieldset>

      <fieldset v-if="isInvestment" class="grid gap-3.5 sm:grid-cols-2" data-pending-operation>
        <legend class="text-text-muted mb-3 text-xs font-bold tracking-widest uppercase">
          Operación
        </legend>
        <SegmentedControl
          v-model="draft.side"
          class="sm:col-span-2"
          :options="sideOptions"
          label="Operación"
          variant="soft"
        />
        <BaseInput v-model="draft.symbol" label="Símbolo" placeholder="VWCE" required />
        <BaseInput v-model="draft.time" label="Hora" type="time" />
        <BaseInput
          v-model="draft.units"
          label="Títulos"
          type="number"
          min="0.00000001"
          step="0.00000001"
          required
        />
        <BaseInput
          v-model="draft.unitPrice"
          label="Precio por título"
          type="number"
          min="0.000001"
          step="0.000001"
          required
        />
        <BaseInput v-model="draft.fee" label="Comisiones" type="number" min="0" step="0.01" />
        <div class="bg-subtle grid content-center gap-1 rounded-md px-4 py-2.5">
          <span class="text-text-muted text-sm">Importe total</span>
          <p class="font-display text-lg tabular-nums">{{ formatMoney(investmentTotal) }}</p>
        </div>
      </fieldset>
    </form>

    <template #footer>
      <BaseButton variant="ghost" @click="open = false">Cancelar edición</BaseButton>
      <BaseButton variant="primary" type="submit" form="pending-edit-form"
        >Guardar edición</BaseButton
      >
    </template>
  </SidePanel>
</template>
