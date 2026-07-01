<script setup lang="ts">
import { storeToRefs } from 'pinia'
import { reactive } from 'vue'

import { useMovementsStore } from '../../stores/movements'

const movementsStore = useMovementsStore()
const { accounts, selectedVisibleCount } = storeToRefs(movementsStore)

const bulk = reactive({ type: '', accountId: '', category: '' })

function onApply(): void {
  movementsStore.applyBulkChanges({
    type: bulk.type,
    accountId: bulk.accountId,
    category: bulk.category,
  })
}
</script>

<template>
  <article class="card tx-bulk-card">
    <h3>Selección múltiple</h3>
    <div
      class="tx-bulk-grid [&_label]:grid [&_label]:gap-1.5 [&_label]:text-[0.78rem] [&_label]:font-semibold [&_label]:text-text-muted [&_:is(select,input)]:min-h-[42px] [&_:is(select,input)]:w-full [&_:is(select,input)]:rounded-(--radius-md) [&_:is(select,input)]:border [&_:is(select,input)]:border-(--line) [&_:is(select,input)]:bg-(--bg-card) [&_:is(select,input)]:px-3 [&_:is(select,input)]:py-[9px] [&_:is(select,input)]:text-text-main [&_:is(select,input)]:transition [&_:is(select,input):focus-visible]:border-primary [&_:is(select,input):focus-visible]:shadow-[0_0_0_3px_var(--ring)] [&_:is(select,input):focus-visible]:outline-none [&_select]:cursor-pointer [&_input]:placeholder:text-text-faint"
    >
      <p id="tx-selected-count" class="tx-selected-count">
        {{ selectedVisibleCount }} seleccionadas
      </p>
      <label>
        Tipo (lote)
        <select id="tx-bulk-type" v-model="bulk.type" name="txBulkType">
          <option value="">Sin cambio</option>
          <option value="income">Ingreso</option>
          <option value="expense">Gasto</option>
          <option value="investment">Inversión</option>
        </select>
      </label>
      <label>
        Cuenta (lote)
        <select id="tx-bulk-account" v-model="bulk.accountId" name="txBulkAccount">
          <option value="">Sin cambio</option>
          <option v-for="account in accounts" :key="account.id" :value="account.id">
            {{ account.name }}
          </option>
        </select>
      </label>
      <label>
        Categoría (lote)
        <input
          id="tx-bulk-category"
          v-model="bulk.category"
          name="txBulkCategory"
          type="text"
          placeholder="Sin cambio"
          autocomplete="off"
        />
      </label>
      <button
        id="tx-bulk-apply"
        type="button"
        class="secondary-btn"
        :disabled="selectedVisibleCount === 0"
        @click="onApply"
      >
        Aplicar
      </button>
      <button
        id="tx-bulk-delete"
        type="button"
        class="danger-btn"
        :disabled="selectedVisibleCount === 0"
        @click="movementsStore.deleteSelected()"
      >
        Eliminar
      </button>
    </div>
  </article>
</template>
