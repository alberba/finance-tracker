<script setup lang="ts">
import { computed, onMounted, reactive, watch } from 'vue'

import { computeInvestmentMovement } from '../../scripts/investment-movements'
import { todayISO } from '../../scripts/utils'
import { useFinancialStateStore } from '../../stores/financial-state'
import { useInvestmentStore } from '../../stores/investment'

const investmentStore = useInvestmentStore()
const financialStateStore = useFinancialStateStore()

function nowTime(): string {
  const now = new Date()
  return `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`
}

const form = reactive({
  date: '',
  time: '',
  side: 'buy',
  symbol: '',
  category: '',
  unitPrice: '',
  units: '',
  fee: '0',
  movementCurrency: 'EUR',
  accountId: '',
  declared: false,
})

const isBitvavo = computed(() => investmentStore.isBitvavoBrokerAccount(form.accountId))
const categoryOptions = computed(() =>
  isBitvavo.value ? ['Crypto'] : investmentStore.investmentCategories,
)

const computedTotal = computed(() => {
  const computed = computeInvestmentMovement({
    side: form.side === 'sell' ? 'sell' : 'buy',
    symbol: form.symbol,
    units: Number(form.units) || 0,
    unitPrice: Number(form.unitPrice) || 0,
    fee: Number(form.fee) || 0,
  })
  return String(computed.signedAmount)
})

function syncCategoryForBroker(): void {
  if (isBitvavo.value) {
    form.category = 'Crypto'
    return
  }
  if (form.category === 'Crypto' || !categoryOptions.value.includes(form.category)) {
    form.category = categoryOptions.value[0] ?? ''
  }
}

watch(() => form.accountId, syncCategoryForBroker)

function resetDefaults(keep: Partial<typeof form> = {}): void {
  form.symbol = ''
  form.unitPrice = ''
  form.units = ''
  form.fee = '0'
  form.declared = false
  Object.assign(form, keep)
  syncCategoryForBroker()
}

onMounted(() => {
  form.date = todayISO()
  form.time = nowTime()
  form.movementCurrency = (financialStateStore.currency || 'EUR').toUpperCase()
  form.accountId = financialStateStore.accounts[0]?.id ?? ''
  syncCategoryForBroker()
})

function onSubmit(): void {
  const added = investmentStore.addMovement({
    date: form.date,
    time: form.time,
    side: form.side,
    symbol: form.symbol,
    category: form.category,
    unitPrice: form.unitPrice,
    units: form.units,
    fee: form.fee,
    movementCurrency: form.movementCurrency,
    accountId: form.accountId,
    declared: form.declared,
  })
  if (added) {
    resetDefaults({
      date: form.date,
      time: form.time,
      side: form.side,
      accountId: form.accountId,
      movementCurrency: form.movementCurrency,
    })
  }
}
</script>

<template>
  <article class="card">
    <h3>Nuevo movimiento de inversión</h3>
    <form
      id="investment-movement-form"
      class="form-grid investment-form"
      autocomplete="off"
      @submit.prevent="onSubmit"
    >
      <label>
        Fecha
        <input id="investment-movement-date" v-model="form.date" name="date" type="date" required />
      </label>
      <label>
        Hora
        <input id="investment-movement-time" v-model="form.time" name="time" type="time" required />
      </label>
      <label>
        Operación
        <select id="investment-movement-side" v-model="form.side" name="side" required>
          <option value="buy">Compra</option>
          <option value="sell">Venta</option>
        </select>
      </label>
      <label>
        Símbolo
        <input
          id="investment-movement-symbol"
          v-model="form.symbol"
          name="symbol"
          type="text"
          maxlength="20"
          required
          placeholder="VWCE"
        />
      </label>
      <label>
        Categoría
        <select
          id="investment-movement-category"
          v-model="form.category"
          name="category"
          :disabled="isBitvavo"
          :aria-disabled="isBitvavo ? 'true' : undefined"
        >
          <option v-for="name in categoryOptions" :key="name" :value="name">{{ name }}</option>
        </select>
      </label>
      <label>
        Precio compra (€)
        <input
          id="investment-movement-unit-price"
          v-model="form.unitPrice"
          name="unitPrice"
          type="number"
          min="0"
          step="0.0001"
          required
        />
      </label>
      <label>
        Títulos
        <input
          id="investment-movement-units"
          v-model="form.units"
          name="units"
          type="number"
          min="0"
          step="0.00000001"
          required
        />
      </label>
      <label>
        Comisiones
        <input
          id="investment-movement-fee"
          v-model="form.fee"
          name="fee"
          type="number"
          min="0"
          step="0.01"
          required
        />
      </label>
      <label>
        Gasto (incl. comisión)
        <input id="investment-movement-total" :value="computedTotal" name="total" type="number" readonly />
      </label>
      <label>
        Moneda
        <input
          id="investment-movement-currency"
          v-model="form.movementCurrency"
          name="movementCurrency"
          type="text"
          maxlength="3"
          required
        />
      </label>
      <label>
        Broker
        <select id="investment-movement-broker" v-model="form.accountId" name="accountId" required>
          <option v-for="account in investmentStore.accounts" :key="account.id" :value="account.id">
            {{ account.name }}
          </option>
        </select>
      </label>
      <label class="investment-declared-field">
        <input
          id="investment-movement-declared"
          v-model="form.declared"
          name="declared"
          type="checkbox"
        />
        Declarado
      </label>
      <button type="submit" class="primary-btn">Guardar movimiento</button>
    </form>
  </article>
</template>
