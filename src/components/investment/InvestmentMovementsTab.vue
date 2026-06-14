<script setup lang="ts">
import { storeToRefs } from 'pinia'
import { computed, reactive, watch } from 'vue'

import InvestmentMovementForm from './InvestmentMovementForm.vue'
import { useMoneyFormatter } from '../../composables/useMoneyFormatter'
import { computeInvestmentMovement } from '../../scripts/investment-movements'
import type { Transaction } from '../../scripts/types'
import { useInvestmentStore } from '../../stores/investment'
import { useUiStore } from '../../stores/ui'

defineProps<{ isActive: boolean }>()

const investmentStore = useInvestmentStore()
const uiStore = useUiStore()
const ui = uiStore.ui
const { movementRows, yearOptions, investmentCategories } = storeToRefs(investmentStore)
const { formatMoney } = useMoneyFormatter()

const editDraft = reactive({
  date: '',
  time: '',
  side: 'buy',
  symbol: '',
  category: '',
  unitPrice: '',
  units: '',
  fee: '',
  movementCurrency: '',
  accountId: '',
  declared: false,
})

const editIsBitvavo = computed(() => investmentStore.isBitvavoBrokerAccount(editDraft.accountId))
const editCategoryOptions = computed(() => {
  if (editIsBitvavo.value) {
    return ['Crypto']
  }
  return Array.from(new Set([...investmentCategories.value, editDraft.category, 'Crypto'])).filter(
    Boolean,
  )
})
const editComputedAmount = computed(() => {
  const computed = computeInvestmentMovement({
    side: editDraft.side === 'sell' ? 'sell' : 'buy',
    symbol: editDraft.symbol,
    units: Number(editDraft.units) || 0,
    unitPrice: Number(editDraft.unitPrice) || 0,
    fee: Number(editDraft.fee) || 0,
  })
  return String(computed.signedAmount)
})

watch(
  () => editDraft.accountId,
  () => {
    if (editIsBitvavo.value) {
      editDraft.category = 'Crypto'
    }
  },
)

function onStartEdit(tx: Transaction): void {
  editDraft.date = String(tx.date)
  editDraft.time = tx.time || '00:00'
  editDraft.side = tx.side === 'sell' ? 'sell' : 'buy'
  editDraft.symbol = tx.symbol || tx.category || ''
  editDraft.category = tx.category || ''
  editDraft.unitPrice = String(Number.isFinite(tx.unitPrice) ? Number(tx.unitPrice) : 0)
  editDraft.units = String(Number.isFinite(tx.units) ? Number(tx.units) : 0)
  editDraft.fee = String(Number.isFinite(tx.fee) ? Number(tx.fee) : 0)
  editDraft.movementCurrency = (tx.movementCurrency || 'EUR').toUpperCase()
  editDraft.accountId = tx.accountId
  editDraft.declared = Boolean(tx.declared)
  investmentStore.startEditMovement(tx.id)
}

function onSaveEdit(id: string): void {
  investmentStore.saveEditedMovement(id, { ...editDraft })
}

function onYearChange(event: Event): void {
  investmentStore.setYearFilter(Number((event.target as HTMLSelectElement).value))
}

function fmt(value: number | undefined, digits: number): string {
  return Number.isFinite(value) ? Number(value).toFixed(digits) : digits === 2 ? '0.00' : '-'
}
</script>

<template>
  <div
    id="investment-tab-movements"
    class="investment-subtab-panel"
    :class="{ 'is-active': isActive }"
    :hidden="!isActive"
    data-investment-tab-panel="movements"
    role="tabpanel"
  >
    <InvestmentMovementForm />

    <article class="card">
      <h3>Movimientos de inversión</h3>
      <div class="inline-controls investment-table-controls">
        <label>
          Año
          <select
            id="investment-year-filter"
            name="investmentYearFilter"
            :value="ui.investmentYearFilter"
            @change="onYearChange"
          >
            <option v-for="year in yearOptions" :key="year" :value="year">{{ year }}</option>
          </select>
        </label>
        <label class="investment-declared-field">
          <input
            id="investment-only-undeclared"
            type="checkbox"
            name="investmentOnlyUndeclared"
            :checked="ui.investmentOnlyUndeclared"
            @change="investmentStore.setOnlyUndeclared(($event.target as HTMLInputElement).checked)"
          />
          Solo no declarados
        </label>
      </div>
      <div class="table-wrap compact">
        <table>
          <thead>
            <tr>
              <th>Fecha</th>
              <th>Hora</th>
              <th>Operación</th>
              <th>Símbolo</th>
              <th>Categoría</th>
              <th>Precio (€)</th>
              <th>Títulos</th>
              <th>Comisión</th>
              <th>Gasto total</th>
              <th>Moneda</th>
              <th>Broker</th>
              <th>Declarado</th>
              <th>Acciones</th>
            </tr>
          </thead>
          <tbody id="investment-tx-table-body">
            <tr v-if="!movementRows.length">
              <td colspan="13">Sin movimientos de inversión para este filtro.</td>
            </tr>

            <template v-for="row in movementRows" v-else :key="row.tx.id">
              <tr v-if="ui.investmentTxEditingId === row.tx.id" :data-investment-editing-id="row.tx.id">
                <td><input v-model="editDraft.date" type="date" data-edit-field="date" /></td>
                <td><input v-model="editDraft.time" type="time" data-edit-field="time" /></td>
                <td>
                  <select v-model="editDraft.side" data-edit-field="side">
                    <option value="buy">Compra</option>
                    <option value="sell">Venta</option>
                  </select>
                </td>
                <td><input v-model="editDraft.symbol" type="text" data-edit-field="symbol" /></td>
                <td>
                  <select
                    v-model="editDraft.category"
                    data-edit-field="category"
                    :disabled="editIsBitvavo"
                    :aria-disabled="editIsBitvavo ? 'true' : undefined"
                  >
                    <option v-for="name in editCategoryOptions" :key="name" :value="name">{{ name }}</option>
                  </select>
                </td>
                <td><input v-model="editDraft.unitPrice" type="number" step="0.0001" min="0" data-edit-field="unitPrice" /></td>
                <td><input v-model="editDraft.units" type="number" step="0.00000001" min="0" data-edit-field="units" /></td>
                <td><input v-model="editDraft.fee" type="number" step="0.01" min="0" data-edit-field="fee" /></td>
                <td><input :value="editComputedAmount" type="number" step="0.01" data-edit-field="amount" readonly /></td>
                <td><input v-model="editDraft.movementCurrency" type="text" maxlength="3" data-edit-field="movementCurrency" /></td>
                <td>
                  <select v-model="editDraft.accountId" data-edit-field="accountId">
                    <option v-for="account in investmentStore.accounts" :key="account.id" :value="account.id">
                      {{ account.name }}
                    </option>
                  </select>
                </td>
                <td>
                  <input v-model="editDraft.declared" type="checkbox" data-edit-field="declared" aria-label="Movimiento declarado" />
                </td>
                <td>
                  <div class="inline-actions">
                    <button type="button" class="inline-save-btn icon-action-btn" aria-label="Guardar" @click="onSaveEdit(row.tx.id)">
                      <svg class="action-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M9 16.2 4.8 12l-1.4 1.4L9 19 21 7l-1.4-1.4z"></path></svg>
                    </button>
                    <button type="button" class="inline-cancel-btn icon-action-btn" aria-label="Cancelar" @click="investmentStore.cancelEditMovement()">
                      <svg class="action-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M18.3 5.7 12 12l6.3 6.3-1.4 1.4L10.6 13.4 4.3 19.7 2.9 18.3 9.2 12 2.9 5.7 4.3 4.3l6.3 6.3 6.3-6.3z"></path></svg>
                    </button>
                  </div>
                </td>
              </tr>

              <tr v-else>
                <td>{{ row.tx.date }}</td>
                <td>{{ row.tx.time || '--:--' }}</td>
                <td>{{ row.sideLabel }}</td>
                <td>{{ row.tx.symbol || row.tx.category || '-' }}</td>
                <td>{{ row.tx.category || 'Sin categoría' }}</td>
                <td>{{ fmt(row.tx.unitPrice, 4) }}</td>
                <td>{{ fmt(row.tx.units, 4) }}</td>
                <td>{{ fmt(row.tx.fee, 2) }}</td>
                <td>{{ formatMoney(row.tx.amount) }}</td>
                <td>{{ row.tx.movementCurrency || 'EUR' }}</td>
                <td>{{ row.account }}</td>
                <td>
                  <button
                    type="button"
                    class="secondary-btn"
                    aria-label="Cambiar declarado"
                    @click="investmentStore.toggleDeclared(row.tx.id)"
                  >
                    <span :class="row.declared ? 'text-good' : 'text-bad'">{{ row.declaredLabel }}</span>
                  </button>
                </td>
                <td>
                  <div class="inline-actions">
                    <button
                      class="edit-btn icon-action-btn"
                      type="button"
                      :aria-label="`Editar movimiento del ${row.tx.date}`"
                      @click="onStartEdit(row.tx)"
                    >
                      <svg class="action-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M3 17.25V21h3.75L18.81 8.94l-3.75-3.75L3 17.25z"></path><path d="M20.71 7.04a1 1 0 0 0 0-1.41L18.37 3.29a1 1 0 0 0-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"></path></svg>
                    </button>
                    <button
                      class="delete-btn icon-action-btn"
                      type="button"
                      :aria-label="`Eliminar movimiento del ${row.tx.date}`"
                      @click="investmentStore.deleteMovement(row.tx.id)"
                    >
                      <svg class="action-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M6 7h12l-1 14H7L6 7z"></path><path d="M9 4h6l1 2H8l1-2z"></path></svg>
                    </button>
                  </div>
                </td>
              </tr>
            </template>
          </tbody>
        </table>
      </div>
    </article>
  </div>
</template>
