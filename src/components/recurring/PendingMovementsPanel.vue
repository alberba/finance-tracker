<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'

import { useFinancialStateStore } from '../../stores/financial-state'
import { useRecurringStore, type PendingMovementEdit } from '../../stores/recurring'
import { getPathFromSection } from '../../scripts/app/dashboard-section-routing'
import { round2 } from '../../scripts/utils'

const props = withDefaults(
  defineProps<{ compact?: boolean }>(),
  { compact: false },
)

const recurringStore = useRecurringStore()
const financialStateStore = useFinancialStateStore()
const pending = computed(() => recurringStore.openPendingMovements)
const editingId = ref('')
const edit = reactive<PendingMovementEdit>({
  type: 'expense',
  date: '',
  accountId: '',
  category: '',
  description: '',
  amount: 0,
  symbol: '',
  side: 'buy',
  units: 0,
  unitPrice: 0,
  fee: 0,
  time: '',
})
const editingIsInvestment = computed(() => edit.type === 'investment')
const investmentTotal = computed(() => round2((edit.units || 0) * (edit.unitPrice || 0) + (edit.fee || 0)))

const availableCategories = computed(() => {
  const type = edit.type || 'expense'
  if (type === 'income') return financialStateStore.state.incomeCategories
  if (type === 'investment') return financialStateStore.state.investmentCategories
  return financialStateStore.state.expenseCategories
})

let isInitializingEdit = false

watch(pending, (items) => {
  if (editingId.value && !items.some((item) => item.id === editingId.value)) editingId.value = ''
})

watch(() => edit.type, (newType, oldType) => {
  if (isInitializingEdit || !oldType) return
  const cats = availableCategories.value
  if (!cats.includes(edit.category)) {
    edit.category = cats[0] || ''
  }
  if (newType === 'investment') {
    const isKnownAccount =
      financialStateStore.investmentAssets.some((a) => a.id === edit.accountId) ||
      financialStateStore.accounts.some((a) => a.id === edit.accountId)
    if (!isKnownAccount) {
      edit.accountId = financialStateStore.investmentAssets[0]?.id || financialStateStore.accounts[0]?.id || ''
    }
  } else {
    if (oldType === 'investment' && investmentTotal.value > 0) {
      edit.amount = investmentTotal.value
    }
    const isInvestmentAsset = financialStateStore.investmentAssets.some((a) => a.id === edit.accountId)
    if (isInvestmentAsset && financialStateStore.accounts[0]) {
      edit.accountId = financialStateStore.accounts[0].id
    }
  }
})

function openTransactions(): void {
  window.history.pushState(null, '', getPathFromSection('transactions'))
  window.dispatchEvent(new PopStateEvent('popstate'))
}

function startEdit(item: (typeof pending.value)[number]): void {
  isInitializingEdit = true
  editingId.value = item.id
  edit.type = item.type || 'expense'
  edit.date = item.occurrenceDate
  edit.accountId = item.accountId
  edit.category = item.category
  edit.description = item.description
  edit.amount = item.amount
  edit.symbol = item.symbol || ''
  edit.side = item.side || 'buy'
  edit.units = item.units ?? 0
  edit.unitPrice = item.unitPrice ?? 0
  edit.fee = item.fee ?? 0
  edit.time = item.time || ''
  queueMicrotask(() => {
    isInitializingEdit = false
  })
}

function saveEdit(): void {
  if (recurringStore.editPending(editingId.value, edit)) editingId.value = ''
}
</script>

<template>
  <aside v-if="props.compact && recurringStore.pendingCount > 0" class="card border-l-4 border-l-accent" role="alert" data-pending-alert>
    <div class="flex flex-wrap items-center justify-between gap-3">
      <div>
        <strong>{{ recurringStore.pendingCount }} movimiento{{ recurringStore.pendingCount === 1 ? '' : 's' }} pendiente{{ recurringStore.pendingCount === 1 ? '' : 's' }}</strong>
        <p class="text-text-muted text-sm">Revisa y confirma antes de incluirlos en tus balances.</p>
      </div>
      <button type="button" class="secondary-btn" data-review-pending @click="openTransactions">Revisar pendientes</button>
    </div>
  </aside>

  <article v-else-if="!props.compact && pending.length" class="card" data-pending-panel>
    <div class="flex flex-wrap items-center justify-between gap-3">
      <div>
        <p class="text-primary font-mono text-[0.65rem] tracking-[0.18em] uppercase">Revisión explícita</p>
        <h3 class="font-display text-text-main text-xl tracking-normal normal-case">Pendientes <span class="text-accent">({{ recurringStore.pendingCount }})</span></h3>
        <p class="text-text-muted text-sm">No afectan balances ni patrimonio hasta confirmarlos.</p>
      </div>
      <button v-if="recurringStore.pendingCount" type="button" class="secondary-btn" @click="recurringStore.refreshPending()">Buscar vencimientos</button>
    </div>

    <p v-if="!pending.length" class="mt-4 text-sm text-text-muted">No hay movimientos pendientes de revisión.</p>
    <div v-else class="mt-4 grid gap-3">
      <article v-for="item in pending" :key="item.id" class="rounded-lg border border-[var(--line)] p-3" data-pending-item>
        <form v-if="editingId === item.id" class="settings-fields grid gap-3 md:grid-cols-5" @submit.prevent="saveEdit">
          <label>Tipo
            <select v-model="edit.type" required>
              <option value="expense">Gasto</option>
              <option value="income">Ingreso</option>
              <option value="investment">Inversión</option>
            </select>
          </label>
          <label>Fecha<input v-model="edit.date" type="date" required /></label>
          <label>Cuenta
            <select v-model="edit.accountId" required>
              <template v-if="edit.type === 'investment'">
                <optgroup v-if="financialStateStore.investmentAssets.length" label="Activos de inversión">
                  <option v-for="asset in financialStateStore.investmentAssets" :key="asset.id" :value="asset.id">
                    {{ asset.name }}
                  </option>
                </optgroup>
                <optgroup v-if="financialStateStore.accounts.length" label="Cuentas de efectivo">
                  <option v-for="account in financialStateStore.accounts" :key="account.id" :value="account.id">
                    {{ account.name }}
                  </option>
                </optgroup>
              </template>
              <template v-else>
                <option v-for="account in financialStateStore.accounts" :key="account.id" :value="account.id">
                  {{ account.name }}
                </option>
              </template>
            </select>
          </label>
          <label>Categoría
            <select v-model="edit.category" required>
              <option v-if="edit.category && !availableCategories.includes(edit.category)" :value="edit.category">
                {{ edit.category }}
              </option>
              <option v-for="category in availableCategories" :key="category" :value="category">
                {{ category }}
              </option>
            </select>
          </label>
          <label>Descripción<input v-model="edit.description" required /></label>
          <template v-if="editingIsInvestment">
            <label>Hora<input v-model="edit.time" type="time" /></label>
            <label>Operación<select v-model="edit.side"><option value="buy">Compra</option><option value="sell">Venta</option></select></label>
            <label>Símbolo<input v-model="edit.symbol" required placeholder="VWCE" /></label>
            <label>Títulos<input v-model.number="edit.units" type="number" min="0.00000001" step="0.00000001" required /></label>
            <label>Precio por título<input v-model.number="edit.unitPrice" type="number" min="0.000001" step="0.000001" required /></label>
            <label>Comisiones<input v-model.number="edit.fee" type="number" min="0" step="0.01" /></label>
            <label>Importe total<input :value="investmentTotal.toFixed(2)" type="text" readonly /></label>
          </template>
          <label v-else>Importe<input v-model.number="edit.amount" type="number" min="0.01" step="0.01" required /></label>
          <div class="flex gap-2 md:col-span-5"><button type="submit" class="primary-btn">Guardar edición</button><button type="button" class="secondary-btn" @click="editingId = ''">Cancelar edición</button></div>
        </form>
        <div v-else class="flex flex-wrap items-center justify-between gap-3">
          <div>
            <strong>{{ item.description }}</strong>
            <p class="text-text-muted text-sm">{{ item.occurrenceDate }} · {{ item.category }} · {{ item.amount.toFixed(2) }}<template v-if="item.type === 'investment' && item.symbol"> · {{ item.units }} × {{ item.unitPrice }} {{ item.symbol }}</template></p>
          </div>
          <div class="flex flex-wrap gap-2">
            <button type="button" class="secondary-btn" @click="startEdit(item)">Editar</button>
            <button type="button" class="primary-btn" @click="recurringStore.confirmPending(item.id)">Confirmar</button>
            <button type="button" class="secondary-btn" @click="recurringStore.skipPending(item.id)">Saltar</button>
            <button type="button" class="danger-btn" @click="recurringStore.cancelPending(item.id)">Cancelar</button>
          </div>
        </div>
      </article>
    </div>
  </article>
</template>
