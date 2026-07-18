<script setup lang="ts">
import { storeToRefs } from 'pinia'
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import * as Sentry from '@sentry/astro'

import CategoryEditorBlock from '../settings/CategoryEditorBlock.vue'
import EntityEditorCard from '../settings/EntityEditorCard.vue'
import StockEventsPanel from '../settings/StockEventsPanel.vue'
import AppSection from '../ui/AppSection.vue'
import { useSettingsStore } from '../../stores/settings'
import InstrumentEditorPanel from '../market/InstrumentEditorPanel.vue'
import RecurringRulesPanel from '../recurring/RecurringRulesPanel.vue'

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

function onSendSentryTestError(): void {
  Sentry.logger.info(Sentry.logger.fmt`El usuario activó el error de prueba de Sentry`, {
    action: 'settings_sentry_test_error',
  })
  Sentry.metrics.count('settings_sentry_test_error', 1)
  throw new Error('Error de prueba enviado desde Configuración.')
}

const indexEntries = [
  { id: 'cfg-general', num: '01', label: 'General' },
  { id: 'cfg-instrumentos', num: '02', label: 'Instrumentos' },
  { id: 'cfg-recurrentes', num: '03', label: 'Recurrentes' },
  { id: 'cfg-cuentas', num: '04', label: 'Cuentas' },
  { id: 'cfg-activos', num: '05', label: 'Activos' },
  { id: 'cfg-pasivos', num: '06', label: 'Pasivos' },
  { id: 'cfg-categorias', num: '07', label: 'Categorías' },
  { id: 'cfg-twr', num: '08', label: 'Liquidez TWR' },
  { id: 'cfg-stockevents', num: '09', label: 'Stock Events' },
]

const activeBlockId = ref(indexEntries[0].id)
let observer: IntersectionObserver | null = null

function scrollToBlock(id: string): void {
  document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

onMounted(() => {
  observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) {
          activeBlockId.value = entry.target.id
        }
      }
    },
    { rootMargin: '-15% 0px -70% 0px' },
  )
  document
    .querySelectorAll('#settings .settings-block')
    .forEach((block) => observer?.observe(block))
})

onBeforeUnmount(() => {
  observer?.disconnect()
})
</script>

<template>
  <AppSection id="settings" :is-active="isActive">
    <div class="panel-head">
      <div>
        <p class="panel-kicker">Datos maestros</p>
        <h2 id="settings-title">Configuración base</h2>
        <p>Gestiona cuentas, activos, categorías y datos maestros.</p>
      </div>
    </div>

    <div class="settings-layout">
      <nav class="settings-index" aria-label="Índice de configuración">
        <a
          v-for="entry in indexEntries"
          :key="entry.id"
          :href="`#${entry.id}`"
          :data-num="entry.num"
          :class="{ 'is-active': activeBlockId === entry.id }"
          @click.prevent="scrollToBlock(entry.id)"
        >
          {{ entry.label }}
        </a>
      </nav>

      <div class="settings-doc">
        <section id="cfg-general" class="settings-block">
          <header>
            <span class="settings-block__num">01</span>
            <h3>General</h3>
            <p>Año de trabajo y moneda con los que se calcula todo el tracker.</p>
          </header>
          <div class="settings-block__body">
            <div class="settings-head settings-fields">
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
              <button
                id="save-settings-main"
                type="button"
                class="primary-btn"
                @click="onSaveGeneral"
              >
                Guardar ajustes
              </button>
              <button
                id="send-sentry-test-error"
                type="button"
                class="danger-btn"
                @click="onSendSentryTestError"
              >
                Enviar error de prueba a Sentry
              </button>
            </div>
          </div>
        </section>

        <InstrumentEditorPanel />
        <RecurringRulesPanel />

        <EntityEditorCard
          section-id="cfg-cuentas"
          num="04"
          title="Cuentas de liquidez"
          description="Cuentas corrientes y de ahorro con su saldo de partida."
          entity-key="accounts"
          form-id="add-account-form"
          list-id="settings-accounts"
          :items="viewModel.accounts"
          name-placeholder="Nombre cuenta"
          balance-placeholder="Saldo inicial"
          balance-label="Saldo inicial"
        />

        <EntityEditorCard
          section-id="cfg-activos"
          num="05"
          title="Activos de inversión"
          description="Fondos, ETF, acciones y cripto con su valor de partida."
          entity-key="investmentAssets"
          form-id="add-investment-form"
          list-id="settings-investments"
          :items="viewModel.investmentAssets"
          name-placeholder="Activo"
          balance-placeholder="Valor inicial"
          balance-label="Valor inicial"
        />

        <EntityEditorCard
          section-id="cfg-pasivos"
          num="06"
          title="Pasivos / deudas"
          description="Préstamos y deudas pendientes con su importe de partida."
          entity-key="liabilities"
          form-id="add-liability-form"
          list-id="settings-liabilities"
          :items="viewModel.liabilities"
          name-placeholder="Pasivo"
          balance-placeholder="Monto inicial"
          balance-label="Monto inicial"
        />

        <section id="cfg-categorias" class="settings-block">
          <header>
            <span class="settings-block__num">07</span>
            <h3>Categorías</h3>
            <p>Etiquetas con las que se clasifican ingresos, gastos e inversión.</p>
          </header>
          <div class="settings-block__body">
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
          </div>
        </section>

        <section id="cfg-twr" class="settings-block">
          <header>
            <span class="settings-block__num">08</span>
            <h3>Liquidez para TWR</h3>
            <p>
              Cuentas de brokers que se incluyen como liquidez en el cálculo de
              cartera para TWR.
            </p>
          </header>
          <div class="settings-block__body">
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
          </div>
        </section>

        <StockEventsPanel />
      </div>
    </div>
  </AppSection>
</template>
