<script setup lang="ts">
import { computed, reactive, ref, shallowRef, watch } from 'vue'

import { useMoneyFormatter } from '../../composables/useMoneyFormatter'
import { computeInvestmentMovement } from '../../scripts/investment-movements'
import type { Transaction } from '../../scripts/types'
import { todayISO } from '../../scripts/utils'
import { useFinancialStateStore } from '../../stores/financial-state'
import { useInvestmentStore } from '../../stores/investment'
import { useStockEventsStore } from '../../stores/stockevents'

const investmentStore = useInvestmentStore()
const stockEventsStore = useStockEventsStore()
const financialStateStore = useFinancialStateStore()
const { formatMoney } = useMoneyFormatter()

const dialogRef = ref<HTMLDialogElement | null>(null)
/** Id of the movement being edited; empty while creating a new one. */
const editingId = shallowRef('')

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
  toCash: false,
})

const isEditing = computed(() => editingId.value !== '')
const isBuy = computed(() => form.side !== 'sell')
const isBitvavo = computed(() => investmentStore.isBitvavoBrokerAccount(form.accountId))
const categoryOptions = computed(() => {
  if (isBitvavo.value) return ['Crypto']
  const base = investmentStore.investmentCategories
  return isEditing.value && form.category && !base.includes(form.category)
    ? [...base, form.category]
    : base
})
const canSyncMovement = computed(() => !isEditing.value && stockEventsStore.canSyncSymbol(form.symbol))

const computedMovement = computed(() =>
  computeInvestmentMovement({
    side: isBuy.value ? 'buy' : 'sell',
    symbol: form.symbol,
    units: Number(form.units) || 0,
    unitPrice: Number(form.unitPrice) || 0,
    fee: Number(form.fee) || 0,
  }),
)
const totalLabel = computed(() => (isBuy.value ? 'Total de la compra' : 'Recibes por la venta'))
const formula = computed(
  () =>
    `${Number(form.units) || 0} × ${formatMoney(Number(form.unitPrice) || 0)} ${isBuy.value ? '+' : '−'} ${formatMoney(Number(form.fee) || 0)}`,
)

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
const defaultToCash = (): boolean =>
  canSyncMovement.value && stockEventsStore.settings.tradesToCash === true
watch(defaultToCash, (toCash) => {
  form.toCash = toCash
})

function fillForNew(): void {
  editingId.value = ''
  Object.assign(form, {
    date: form.date || todayISO(),
    time: form.time || nowTime(),
    side: form.side || 'buy',
    symbol: '',
    unitPrice: '',
    units: '',
    fee: '0',
    movementCurrency: form.movementCurrency || (financialStateStore.currency || 'EUR').toUpperCase(),
    accountId: form.accountId || (financialStateStore.accounts[0]?.id ?? ''),
    declared: false,
  })
  form.toCash = defaultToCash()
  syncCategoryForBroker()
}

function fillForEdit(tx: Transaction): void {
  editingId.value = tx.id
  Object.assign(form, {
    date: String(tx.date),
    time: tx.time || '00:00',
    side: tx.side === 'sell' ? 'sell' : 'buy',
    symbol: tx.symbol || tx.category || '',
    category: tx.category || '',
    unitPrice: String(Number.isFinite(tx.unitPrice) ? Number(tx.unitPrice) : 0),
    units: String(Number.isFinite(tx.units) ? Number(tx.units) : 0),
    fee: String(Number.isFinite(tx.fee) ? Number(tx.fee) : 0),
    movementCurrency: (tx.movementCurrency || 'EUR').toUpperCase(),
    accountId: tx.accountId,
    declared: Boolean(tx.declared),
    toCash: false,
  })
  investmentStore.startEditMovement(tx.id)
}

function open(tx?: Transaction): void {
  if (tx) fillForEdit(tx)
  else fillForNew()
  dialogRef.value?.showModal?.()
}

function close(): void {
  if (isEditing.value) investmentStore.cancelEditMovement()
  editingId.value = ''
  if (dialogRef.value?.open) dialogRef.value.close()
}

function onSubmit(): void {
  const input = {
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
    toCash: form.toCash,
  }
  const saved = isEditing.value
    ? investmentStore.saveEditedMovement(editingId.value, input)
    : investmentStore.addMovement(input)
  if (saved) {
    editingId.value = ''
    if (dialogRef.value?.open) dialogRef.value.close()
  }
}

defineExpose({ open })
</script>

<template>
  <dialog
    id="investment-movement-dialog"
    ref="dialogRef"
    class="inv-drawer"
    aria-labelledby="investment-movement-title"
    @cancel="close"
  >
    <header class="inv-drawer__head">
      <div>
        <p class="inv-kicker">Movimiento de inversión</p>
        <h3 id="investment-movement-title">{{ isEditing ? 'Editar movimiento' : 'Nuevo movimiento' }}</h3>
      </div>
      <button type="button" class="inv-icon-btn" aria-label="Cerrar sin guardar" @click="close">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
      </button>
    </header>

    <form id="investment-movement-form" class="inv-drawer__form" autocomplete="off" @submit.prevent="onSubmit">
      <div class="inv-drawer__body">
        <div class="inv-seg inv-seg--soft inv-side-toggle" role="group" aria-label="Operación">
          <button
            id="investment-movement-side-buy"
            type="button"
            data-side="buy"
            :class="{ 'is-active': isBuy }"
            :aria-pressed="isBuy"
            @click="form.side = 'buy'"
          >
            Compra
          </button>
          <button
            id="investment-movement-side-sell"
            type="button"
            data-side="sell"
            :class="{ 'is-active': !isBuy }"
            :aria-pressed="!isBuy"
            @click="form.side = 'sell'"
          >
            Venta
          </button>
        </div>

        <fieldset class="inv-fieldset">
          <legend>Activo</legend>
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
              style="font-family: 'DM Mono', monospace"
            />
          </label>
          <label>
            Categoría
            <span class="inv-select">
              <select
                id="investment-movement-category"
                v-model="form.category"
                name="category"
                :disabled="isBitvavo"
                :aria-disabled="isBitvavo ? 'true' : undefined"
              >
                <option v-for="name in categoryOptions" :key="name" :value="name">{{ name }}</option>
              </select>
            </span>
          </label>
          <label class="is-wide">
            Broker
            <span class="inv-select">
              <select id="investment-movement-broker" v-model="form.accountId" name="accountId" required>
                <option v-for="account in investmentStore.accounts" :key="account.id" :value="account.id">
                  {{ account.name }}
                </option>
              </select>
            </span>
          </label>
        </fieldset>

        <fieldset class="inv-fieldset inv-fieldset--amount">
          <legend>Importe</legend>
          <label>
            Títulos
            <input id="investment-movement-units" v-model="form.units" name="units" type="number" min="0" step="0.00000001" required />
          </label>
          <label>
            Precio (€)
            <input id="investment-movement-unit-price" v-model="form.unitPrice" name="unitPrice" type="number" min="0" step="0.0001" required />
          </label>
          <label>
            Comisión (€)
            <input id="investment-movement-fee" v-model="form.fee" name="fee" type="number" min="0" step="0.01" required />
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
              style="font-family: 'DM Sans', sans-serif; text-align: left; text-transform: uppercase"
            />
          </label>
          <div class="inv-total">
            <span>{{ totalLabel }}<small>{{ formula }}</small></span>
            <output id="investment-movement-total" for="investment-movement-units investment-movement-unit-price investment-movement-fee">
              {{ formatMoney(Math.abs(computedMovement.signedAmount)) }}
            </output>
          </div>
        </fieldset>

        <fieldset class="inv-fieldset">
          <legend>Cuándo</legend>
          <label>
            Fecha
            <input id="investment-movement-date" v-model="form.date" name="date" type="date" required />
          </label>
          <label>
            Hora
            <input id="investment-movement-time" v-model="form.time" name="time" type="time" required />
          </label>
        </fieldset>

        <div class="inv-checks">
          <label>
            <input id="investment-movement-declared" v-model="form.declared" name="declared" type="checkbox" />
            Ya está declarado
          </label>
          <label v-if="canSyncMovement">
            <input
              id="investment-movement-to-cash"
              v-model="form.toCash"
              name="toCash"
              type="checkbox"
              aria-describedby="investment-movement-to-cash-hint"
            />
            <span>
              {{ isBuy ? 'Descontar del efectivo en Stock Events' : 'Añadir al efectivo en Stock Events' }}
              <small id="investment-movement-to-cash-hint">Se sincroniza con Stock Events al guardar.</small>
            </span>
          </label>
        </div>
      </div>

      <footer class="inv-drawer__foot">
        <button type="button" class="inv-secondary" @click="close">Cancelar</button>
        <button type="submit" class="inv-primary">{{ isEditing ? 'Guardar cambios' : 'Guardar movimiento' }}</button>
      </footer>
    </form>
  </dialog>
</template>
