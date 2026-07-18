<script setup lang="ts">
import { storeToRefs } from 'pinia'
import { reactive, watch } from 'vue'

import { useMoneyFormatter } from '../../composables/useMoneyFormatter'
import { decorateCategoryLabel } from '../../scripts/category-emoji'
import type { Transaction, TxSortColumn } from '../../scripts/types'
import { useMovementsStore } from '../../stores/movements'
import { useUiStore } from '../../stores/ui'

const movementsStore = useMovementsStore()
const uiStore = useUiStore()
const ui = uiStore.ui
const { visibleTransactions, accountFilterOptions, allVisibleSelected, categoryEmojis } =
  storeToRefs(movementsStore)
const typeFilterOptions = movementsStore.typeFilterOptions
const { formatMoney } = useMoneyFormatter()

const editDraft = reactive({
  date: '',
  description: '',
  amount: '',
  accountId: '',
  type: 'expense',
  category: '',
})

// Changing a filter invalidates the current selection/edit, mirroring legacy.
watch(
  () => ui.txFilters,
  () => {
    ui.txEditingId = ''
    ui.txSelectedIds = []
  },
  { deep: true },
)

function isOpen(column: TxSortColumn): boolean {
  return ui.txOpenHeaderFilter === column
}

function isFiltered(column: TxSortColumn): boolean {
  if (column === 'date') return Boolean(ui.txFilters.date)
  if (column === 'account') return ui.txFilters.accountIds.length > 0
  if (column === 'type') return ui.txFilters.types.length > 0
  if (column === 'category') return Boolean(ui.txFilters.category)
  if (column === 'description') return Boolean(ui.txFilters.description)
  return Boolean(ui.txFilters.amountMin || ui.txFilters.amountMax)
}

function sortGlyph(column: TxSortColumn): string {
  if (ui.txSort.column !== column) return '↕'
  return ui.txSort.direction === 'asc' ? '↑' : '↓'
}

function typeLabel(type: string): string {
  return type === 'income' ? 'Ingreso' : type === 'expense' ? 'Gasto' : 'Inversión'
}

function typeBadgeClass(type: string): string {
  return type === 'income' ? 'badge-income' : type === 'expense' ? 'badge-expense' : 'badge-investment'
}

function toggleAccountFilter(value: string, checked: boolean): void {
  const next = new Set(ui.txFilters.accountIds)
  if (checked) next.add(value)
  else next.delete(value)
  ui.txFilters.accountIds = Array.from(next)
}

function toggleTypeFilter(value: string, checked: boolean): void {
  const next = new Set(ui.txFilters.types)
  if (checked) next.add(value)
  else next.delete(value)
  ui.txFilters.types = Array.from(next)
}

function onStartEdit(item: Transaction): void {
  editDraft.date = String(item.date)
  editDraft.description = item.description || ''
  editDraft.amount = String(Number(item.amount || 0))
  editDraft.accountId = item.accountId
  editDraft.type = item.type
  editDraft.category = item.category || ''
  movementsStore.startEdit(item.id)
}

function onSaveEdit(id: string): void {
  movementsStore.saveEdit(id, {
    date: editDraft.date,
    accountId: editDraft.accountId,
    type: editDraft.type,
    category: editDraft.category,
    description: editDraft.description,
    amount: editDraft.amount,
  })
}
</script>

<template>
  <div class="table-wrap">
    <table>
      <thead>
        <tr>
          <th class="tx-col-select">
            <input
              id="tx-select-all"
              type="checkbox"
              name="txSelectAll"
              aria-label="Seleccionar todas las filas visibles"
              :checked="allVisibleSelected"
              @change="movementsStore.setAllSelected(($event.target as HTMLInputElement).checked)"
            />
          </th>

          <th
            class="tx-head tx-head--filterable"
            :class="{ 'is-open': isOpen('date'), 'is-filtered': isFiltered('date') }"
            data-filter-column="date"
          >
            <div class="tx-head-main">
              <button
                type="button"
                class="tx-filter-trigger"
                :class="{ 'is-filtered': isFiltered('date') }"
                data-column="date"
                aria-haspopup="true"
                :aria-expanded="isOpen('date') ? 'true' : 'false'"
                @pointerdown.stop
                @click.stop="movementsStore.toggleFilterPopover('date')"
              >
                Fecha
              </button>
              <button
                type="button"
                class="tx-sort-btn"
                :class="{ active: ui.txSort.column === 'date' }"
                data-column="date"
                aria-label="Ordenar por fecha"
                @click="movementsStore.toggleSort('date')"
              >
                {{ sortGlyph('date') }}
              </button>
            </div>
            <div class="tx-filter-popover" data-column="date" :hidden="!isOpen('date')">
              <label for="tx-header-filter-date">Filtrar fecha</label>
              <input
                id="tx-header-filter-date"
                v-model="ui.txFilters.date"
                name="txHeaderFilterDate"
                type="date"
                autocomplete="off"
              />
              <button type="button" class="tx-header-clear-btn" data-column="date" @click="movementsStore.clearFilterColumn('date')">
                Limpiar
              </button>
            </div>
          </th>

          <th
            class="tx-head tx-head--filterable"
            :class="{ 'is-open': isOpen('description'), 'is-filtered': isFiltered('description') }"
            data-filter-column="description"
          >
            <div class="tx-head-main">
              <button
                type="button"
                class="tx-filter-trigger"
                :class="{ 'is-filtered': isFiltered('description') }"
                data-column="description"
                aria-haspopup="true"
                :aria-expanded="isOpen('description') ? 'true' : 'false'"
                @pointerdown.stop
                @click.stop="movementsStore.toggleFilterPopover('description')"
              >
                Descripción
              </button>
              <button
                type="button"
                class="tx-sort-btn"
                :class="{ active: ui.txSort.column === 'description' }"
                data-column="description"
                aria-label="Ordenar por descripción"
                @click="movementsStore.toggleSort('description')"
              >
                {{ sortGlyph('description') }}
              </button>
            </div>
            <div class="tx-filter-popover" data-column="description" :hidden="!isOpen('description')">
              <label for="tx-header-filter-description">Descripción</label>
              <input
                id="tx-header-filter-description"
                v-model="ui.txFilters.description"
                name="txHeaderFilterDescription"
                type="text"
                placeholder="Contiene..."
                autocomplete="off"
              />
              <button type="button" class="tx-header-clear-btn" data-column="description" @click="movementsStore.clearFilterColumn('description')">
                Limpiar
              </button>
            </div>
          </th>

          <th
            class="tx-head tx-head--filterable"
            :class="{ 'is-open': isOpen('amount'), 'is-filtered': isFiltered('amount') }"
            data-filter-column="amount"
          >
            <div class="tx-head-main">
              <button
                type="button"
                class="tx-filter-trigger"
                :class="{ 'is-filtered': isFiltered('amount') }"
                data-column="amount"
                aria-haspopup="true"
                :aria-expanded="isOpen('amount') ? 'true' : 'false'"
                @pointerdown.stop
                @click.stop="movementsStore.toggleFilterPopover('amount')"
              >
                Importe
              </button>
              <button
                type="button"
                class="tx-sort-btn"
                :class="{ active: ui.txSort.column === 'amount' }"
                data-column="amount"
                aria-label="Ordenar por importe"
                @click="movementsStore.toggleSort('amount')"
              >
                {{ sortGlyph('amount') }}
              </button>
            </div>
            <div class="tx-filter-popover" data-column="amount" :hidden="!isOpen('amount')">
              <label for="tx-header-filter-amount-min">Importe mín</label>
              <input
                id="tx-header-filter-amount-min"
                v-model="ui.txFilters.amountMin"
                name="txHeaderFilterAmountMin"
                type="number"
                min="0"
                step="0.01"
                autocomplete="off"
              />
              <label for="tx-header-filter-amount-max">Importe máx</label>
              <input
                id="tx-header-filter-amount-max"
                v-model="ui.txFilters.amountMax"
                name="txHeaderFilterAmountMax"
                type="number"
                min="0"
                step="0.01"
                autocomplete="off"
              />
              <button type="button" class="tx-header-clear-btn" data-column="amount" @click="movementsStore.clearFilterColumn('amount')">
                Limpiar
              </button>
            </div>
          </th>

          <th
            class="tx-head tx-head--filterable"
            :class="{ 'is-open': isOpen('account'), 'is-filtered': isFiltered('account') }"
            data-filter-column="account"
          >
            <div class="tx-head-main">
              <button
                type="button"
                class="tx-filter-trigger"
                :class="{ 'is-filtered': isFiltered('account') }"
                data-column="account"
                aria-haspopup="true"
                :aria-expanded="isOpen('account') ? 'true' : 'false'"
                @pointerdown.stop
                @click.stop="movementsStore.toggleFilterPopover('account')"
              >
                Cuenta
              </button>
              <button
                type="button"
                class="tx-sort-btn"
                :class="{ active: ui.txSort.column === 'account' }"
                data-column="account"
                aria-label="Ordenar por cuenta"
                @click="movementsStore.toggleSort('account')"
              >
                {{ sortGlyph('account') }}
              </button>
            </div>
            <div class="tx-filter-popover" data-column="account" :hidden="!isOpen('account')">
              <label>Cuenta</label>
              <div id="tx-header-filter-account" class="tx-checkbox-list" aria-label="Filtrar cuentas">
                <small v-if="!accountFilterOptions.length">Sin cuentas en este mes.</small>
                <label v-for="option in accountFilterOptions" :key="option.value" class="tx-checkbox-option">
                  <input
                    type="checkbox"
                    :data-filter-value="option.value"
                    :checked="ui.txFilters.accountIds.includes(option.value)"
                    @change="toggleAccountFilter(option.value, ($event.target as HTMLInputElement).checked)"
                  />
                  <span>{{ option.label }}</span>
                </label>
              </div>
              <button type="button" class="tx-header-clear-btn" data-column="account" @click="movementsStore.clearFilterColumn('account')">
                Limpiar
              </button>
            </div>
          </th>

          <th
            class="tx-head tx-head--filterable"
            :class="{ 'is-open': isOpen('type'), 'is-filtered': isFiltered('type') }"
            data-filter-column="type"
          >
            <div class="tx-head-main">
              <button
                type="button"
                class="tx-filter-trigger"
                :class="{ 'is-filtered': isFiltered('type') }"
                data-column="type"
                aria-haspopup="true"
                :aria-expanded="isOpen('type') ? 'true' : 'false'"
                @pointerdown.stop
                @click.stop="movementsStore.toggleFilterPopover('type')"
              >
                Tipo
              </button>
              <button
                type="button"
                class="tx-sort-btn"
                :class="{ active: ui.txSort.column === 'type' }"
                data-column="type"
                aria-label="Ordenar por tipo"
                @click="movementsStore.toggleSort('type')"
              >
                {{ sortGlyph('type') }}
              </button>
            </div>
            <div class="tx-filter-popover" data-column="type" :hidden="!isOpen('type')">
              <label>Tipo</label>
              <div id="tx-header-filter-type" class="tx-checkbox-list" aria-label="Filtrar tipos">
                <label v-for="option in typeFilterOptions" :key="option.value" class="tx-checkbox-option">
                  <input
                    type="checkbox"
                    :data-filter-value="option.value"
                    :checked="ui.txFilters.types.includes(option.value)"
                    @change="toggleTypeFilter(option.value, ($event.target as HTMLInputElement).checked)"
                  />
                  <span>{{ option.label }}</span>
                </label>
              </div>
              <button type="button" class="tx-header-clear-btn" data-column="type" @click="movementsStore.clearFilterColumn('type')">
                Limpiar
              </button>
            </div>
          </th>

          <th
            class="tx-head tx-head--filterable"
            :class="{ 'is-open': isOpen('category'), 'is-filtered': isFiltered('category') }"
            data-filter-column="category"
          >
            <div class="tx-head-main">
              <button
                type="button"
                class="tx-filter-trigger"
                :class="{ 'is-filtered': isFiltered('category') }"
                data-column="category"
                aria-haspopup="true"
                :aria-expanded="isOpen('category') ? 'true' : 'false'"
                @pointerdown.stop
                @click.stop="movementsStore.toggleFilterPopover('category')"
              >
                Categoría
              </button>
              <button
                type="button"
                class="tx-sort-btn"
                :class="{ active: ui.txSort.column === 'category' }"
                data-column="category"
                aria-label="Ordenar por categoría"
                @click="movementsStore.toggleSort('category')"
              >
                {{ sortGlyph('category') }}
              </button>
            </div>
            <div class="tx-filter-popover" data-column="category" :hidden="!isOpen('category')">
              <label for="tx-header-filter-category">Categoría</label>
              <input
                id="tx-header-filter-category"
                v-model="ui.txFilters.category"
                name="txHeaderFilterCategory"
                type="text"
                placeholder="Contiene..."
                autocomplete="off"
              />
              <button type="button" class="tx-header-clear-btn" data-column="category" @click="movementsStore.clearFilterColumn('category')">
                Limpiar
              </button>
            </div>
          </th>

          <th>Acciones</th>
        </tr>
      </thead>
      <tbody id="tx-table-body">
        <tr v-if="!visibleTransactions.length">
          <td colspan="8">Sin movimientos para este mes.</td>
        </tr>

        <template v-for="item in visibleTransactions" v-else :key="item.id">
          <tr v-if="ui.txEditingId === item.id" :data-editing-id="item.id">
            <td></td>
            <td><input v-model="editDraft.date" type="date" autocomplete="off" data-edit-field="date" /></td>
            <td><input v-model="editDraft.description" type="text" autocomplete="off" data-edit-field="description" /></td>
            <td><input v-model="editDraft.amount" type="number" autocomplete="off" step="0.01" data-edit-field="amount" /></td>
            <td>
              <select v-model="editDraft.accountId" data-edit-field="accountId">
                <option v-for="account in movementsStore.accounts" :key="account.id" :value="account.id">
                  {{ account.name }}
                </option>
              </select>
            </td>
            <td>
              <select v-model="editDraft.type" data-edit-field="type">
                <option value="income">Ingreso</option>
                <option value="expense">Gasto</option>
                <option value="investment">Inversión</option>
              </select>
            </td>
            <td><input v-model="editDraft.category" type="text" autocomplete="off" data-edit-field="category" /></td>
            <td>
              <div class="inline-actions">
                <button type="button" class="inline-save-btn icon-action-btn" aria-label="Guardar" @click="onSaveEdit(item.id)">
                  <svg class="action-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                    <path d="M9 16.2 4.8 12l-1.4 1.4L9 19 21 7l-1.4-1.4z"></path>
                  </svg>
                </button>
                <button type="button" class="inline-cancel-btn icon-action-btn" aria-label="Cancelar" @click="movementsStore.cancelEdit()">
                  <svg class="action-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                    <path d="M18.3 5.7 12 12l6.3 6.3-1.4 1.4L10.6 13.4 4.3 19.7 2.9 18.3 9.2 12 2.9 5.7 4.3 4.3l6.3 6.3 6.3-6.3z"></path>
                  </svg>
                </button>
              </div>
            </td>
          </tr>

          <tr v-else :class="{ 'row-selected': ui.txSelectedIds.includes(item.id) }">
            <td>
              <input
                type="checkbox"
                name="txSelectedIds"
                :data-select-tx-id="item.id"
                :checked="ui.txSelectedIds.includes(item.id)"
                :aria-label="`Seleccionar movimiento del ${item.date}`"
                @change="movementsStore.setSelected(item.id, ($event.target as HTMLInputElement).checked)"
              />
            </td>
            <td>{{ item.date }}</td>
            <td>{{ item.description || '-' }}</td>
            <td>{{ formatMoney(item.amount) }}</td>
            <td>{{ movementsStore.getAccountName(item.accountId) }}</td>
            <td><span class="badge" :class="typeBadgeClass(item.type)">{{ typeLabel(item.type) }}</span></td>
            <td>
              {{ decorateCategoryLabel(item.type, item.category || 'Sin categoría', categoryEmojis) }}
            </td>
            <td>
              <div class="inline-actions">
                <button
                  class="edit-btn icon-action-btn"
                  type="button"
                  :aria-label="`Editar movimiento del ${item.date}`"
                  @click="onStartEdit(item)"
                >
                  <svg class="action-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                    <path d="M3 17.25V21h3.75L18.81 8.94l-3.75-3.75L3 17.25z"></path>
                    <path d="M20.71 7.04a1 1 0 0 0 0-1.41L18.37 3.29a1 1 0 0 0-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"></path>
                  </svg>
                </button>
                <button
                  class="delete-btn icon-action-btn"
                  type="button"
                  :data-delete-id="item.id"
                  :aria-label="`Eliminar movimiento del ${item.date}`"
                  @click="movementsStore.deleteTransaction(item.id)"
                >
                  <svg class="action-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                    <path d="M6 7h12l-1 14H7L6 7z"></path>
                    <path d="M9 4h6l1 2H8l1-2z"></path>
                  </svg>
                </button>
              </div>
            </td>
          </tr>
        </template>
      </tbody>
    </table>
  </div>
</template>
