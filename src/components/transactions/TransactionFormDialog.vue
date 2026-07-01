<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'

import { useToast } from '../../composables/useToast'
import { MONTHS, type BudgetType, type TransactionType } from '../../scripts/types'
import { monthFromISO, parseFloatSafe, todayISO } from '../../scripts/utils'
import { useMovementsStore } from '../../stores/movements'
import { useUiStore } from '../../stores/ui'

const movementsStore = useMovementsStore()
const uiStore = useUiStore()
const { showToast } = useToast()

const dialogRef = ref<HTMLDialogElement | null>(null)
const pendingKeepOpen = ref(false)

const form = reactive({
  date: '',
  month: 0,
  type: 'expense' as TransactionType,
  accountId: '',
  category: '',
  description: '',
  amount: '',
})

const categoryOptions = computed(() => movementsStore.orderedCategories(form.type as BudgetType))

function ensureValidCategory(): void {
  const options = categoryOptions.value
  if (!options.length) {
    form.category = ''
    return
  }
  if (!options.includes(form.category)) {
    form.category = options[0]
  }
}

watch(
  () => form.type,
  () => ensureValidCategory(),
)

function open(): void {
  uiStore.ui.txEditingId = ''
  form.month = uiStore.ui.txFilterMonth
  if (!form.date) {
    form.date = todayISO()
  }
  const accounts = movementsStore.accounts
  if (!accounts.some((account) => account.id === form.accountId)) {
    form.accountId = accounts[0]?.id ?? ''
  }
  ensureValidCategory()
  dialogRef.value?.showModal?.()
}

function close(): void {
  const dialog = dialogRef.value
  if (dialog?.open) {
    dialog.close()
  }
}

function onDateChange(): void {
  const month = monthFromISO(form.date)
  if (month !== null) {
    form.month = month
  }
}

function onSubmit(): void {
  const keepOpen = pendingKeepOpen.value
  const added = movementsStore.addTransaction({
    date: form.date || todayISO(),
    month: form.month,
    type: form.type,
    accountId: form.accountId,
    category: form.category,
    description: form.description,
    amount: parseFloatSafe(form.amount, 0),
  })

  if (!added) {
    return
  }

  form.amount = ''
  form.description = ''
  if (!keepOpen) {
    form.date = todayISO()
    close()
  }

  showToast(keepOpen ? 'Guardado. Puedes añadir otro.' : 'Movimiento guardado.')
}

defineExpose({ open })
</script>

<template>
  <dialog id="tx-dialog" ref="dialogRef" class="tx-dialog">
    <form id="tx-form" class="tx-form-dialog" autocomplete="off" @submit.prevent="onSubmit">
      <div class="tx-dialog-head">
        <div class="tx-dialog-title">
          <span class="tx-dialog-icon" aria-hidden="true">+</span>
          <h3>Nuevo movimiento</h3>
        </div>
        <button
          id="tx-close-modal"
          type="button"
          class="tx-close-btn"
          aria-label="Cerrar"
          @click="close"
        >
          ✕
        </button>
      </div>
      <div class="tx-form-fields">
        <label>
          Fecha
          <input
            v-model="form.date"
            type="date"
            name="date"
            required
            autocomplete="off"
            @change="onDateChange"
          />
        </label>
        <label>
          Mes
          <select v-model.number="form.month" name="month" required>
            <option v-for="(name, index) in MONTHS" :key="name" :value="index">{{ name }}</option>
          </select>
        </label>
        <label>
          Tipo
          <select id="tx-type-select" v-model="form.type" name="type" required>
            <option value="expense">Gasto</option>
            <option value="income">Ingreso</option>
            <option value="investment">Inversión</option>
          </select>
        </label>
        <label>
          Cuenta
          <select v-model="form.accountId" name="accountId" required>
            <option v-if="!movementsStore.accounts.length" value="">Sin cuentas</option>
            <option v-for="account in movementsStore.accounts" :key="account.id" :value="account.id">
              {{ account.name }}
            </option>
          </select>
        </label>
        <label class="tx-category-field">
          Categoría
          <select v-model="form.category" name="category" required>
            <option v-if="!categoryOptions.length" value="Sin categoría">Sin categoría</option>
            <option v-for="name in categoryOptions" :key="name" :value="name">{{ name }}</option>
          </select>
        </label>
        <label class="span-3">
          Descripción
          <input
            v-model="form.description"
            type="text"
            name="description"
            maxlength="140"
            placeholder="Detalle opcional"
            autocomplete="off"
          />
        </label>
        <label class="tx-amount-field">
          Importe
          <div class="tx-amount-wrap">
            <span class="tx-amount-currency">€</span>
            <input
              v-model="form.amount"
              type="number"
              name="amount"
              min="0"
              step="0.01"
              required
              placeholder="0.00"
              autocomplete="off"
            />
          </div>
        </label>
      </div>
      <div class="tx-dialog-actions">
        <button
          id="tx-submit-more"
          type="submit"
          class="tx-btn-secondary"
          @click="pendingKeepOpen = true"
        >
          Otro
        </button>
        <button type="submit" class="tx-btn-primary" @click="pendingKeepOpen = false">
          Guardar
        </button>
      </div>
    </form>
  </dialog>
</template>
