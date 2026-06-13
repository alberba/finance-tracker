<script setup lang="ts">
import { storeToRefs } from 'pinia'
import { ref, watch } from 'vue'

import CategoryEditorBlock from '../settings/CategoryEditorBlock.vue'
import EntityEditorCard from '../settings/EntityEditorCard.vue'
import { useSettingsStore } from '../../stores/settings'

withDefaults(
  defineProps<{
    isActive?: boolean
  }>(),
  { isActive: false },
)

const settingsStore = useSettingsStore()
const { viewModel } = storeToRefs(settingsStore)

const yearInput = ref(String(viewModel.value.year))
const currencyInput = ref(viewModel.value.currency)

// Keep the unsaved general form in sync when the year/currency change from
// elsewhere (e.g. the dashboard year control writing through the store).
watch(
  () => viewModel.value.year,
  (year) => {
    yearInput.value = String(year)
  },
)
watch(
  () => viewModel.value.currency,
  (currency) => {
    currencyInput.value = currency
  },
)

function onSaveGeneral(): void {
  settingsStore.saveGeneral(yearInput.value, currencyInput.value)
}
</script>

<template>
  <section
    id="settings"
    class="panel"
    :class="{ 'is-active': isActive }"
    aria-labelledby="settings-title"
  >
    <div class="panel-head">
      <div>
        <p class="panel-kicker">Datos maestros</p>
        <h2 id="settings-title">Configuración base</h2>
        <p>Gestiona cuentas, activos, categorías y datos maestros.</p>
      </div>
    </div>

    <div class="settings-head">
      <label>
        Año
        <input
          id="settings-year"
          v-model="yearInput"
          name="settingsYear"
          type="number"
          min="2000"
          max="2100"
          autocomplete="off"
        />
      </label>
      <label>
        Moneda
        <input
          id="settings-currency"
          v-model="currencyInput"
          name="settingsCurrency"
          type="text"
          maxlength="3"
          autocomplete="off"
        />
      </label>
      <button id="save-settings-main" type="button" class="primary-btn" @click="onSaveGeneral">
        Guardar ajustes
      </button>
    </div>

    <div class="dual-grid">
      <EntityEditorCard
        title="Cuentas de liquidez"
        entity-key="accounts"
        form-id="add-account-form"
        list-id="settings-accounts"
        :items="viewModel.accounts"
        name-placeholder="Nombre cuenta"
        balance-placeholder="Saldo inicial"
        balance-label="Saldo inicial"
      />

      <EntityEditorCard
        title="Activos de inversión"
        entity-key="investmentAssets"
        form-id="add-investment-form"
        list-id="settings-investments"
        :items="viewModel.investmentAssets"
        name-placeholder="Activo"
        balance-placeholder="Valor inicial"
        balance-label="Valor inicial"
      />

      <EntityEditorCard
        title="Pasivos / deudas"
        entity-key="liabilities"
        form-id="add-liability-form"
        list-id="settings-liabilities"
        :items="viewModel.liabilities"
        name-placeholder="Pasivo"
        balance-placeholder="Monto inicial"
        balance-label="Monto inicial"
      />

      <article class="card">
        <h3>Categorías</h3>
        <CategoryEditorBlock
          title="Ingresos"
          category-key="incomeCategories"
          form-id="add-income-category"
          list-id="settings-income-categories"
          :tags="viewModel.incomeCategories"
        />
        <CategoryEditorBlock
          title="Gastos"
          category-key="expenseCategories"
          form-id="add-expense-category"
          list-id="settings-expense-categories"
          :tags="viewModel.expenseCategories"
        />
        <CategoryEditorBlock
          title="Inversión"
          category-key="investmentCategories"
          form-id="add-investment-category"
          list-id="settings-investment-categories"
          :tags="viewModel.investmentCategories"
        />
      </article>

      <article class="card">
        <h3>Liquidez para TWR</h3>
        <p>
          Selecciona qué cuentas de brokers se incluyen como liquidez en el
          cálculo de cartera para TWR.
        </p>
        <div id="settings-twr-liquidity" class="list-stack">
          <small v-if="!viewModel.twrLiquidityOptions.length">Sin cuentas disponibles.</small>
          <label
            v-for="option in viewModel.twrLiquidityOptions"
            :key="option.id"
            class="tx-checkbox-option"
          >
            <input
              type="checkbox"
              :checked="option.selected"
              @change="
                settingsStore.toggleTwrLiquidity(
                  option.id,
                  ($event.target as HTMLInputElement).checked,
                )
              "
            />
            <span>{{ option.name }}</span>
          </label>
        </div>
      </article>
    </div>
  </section>
</template>
