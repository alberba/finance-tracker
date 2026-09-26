<script setup lang="ts">
import { storeToRefs } from 'pinia'
import { computed, ref } from 'vue'

import InvestmentMovementForm from './InvestmentMovementForm.vue'
import { useMoneyFormatter } from '../../composables/useMoneyFormatter'
import type { InvestmentMovementRow } from '../../domain/investment/view-model'
import { parseTransactionYear } from '../../scripts/investment-movements'
import { MONTHS, type Transaction } from '../../scripts/types'
import { useFinancialStateStore } from '../../stores/financial-state'
import { useInvestmentStore } from '../../stores/investment'
import { useStockEventsStore } from '../../stores/stockevents'
import { useUiStore } from '../../stores/ui'

defineProps<{ isActive: boolean }>()

const investmentStore = useInvestmentStore()
const stockEventsStore = useStockEventsStore()
const financialStateStore = useFinancialStateStore()
const ui = useUiStore().ui
const { movementRows, yearOptions } = storeToRefs(investmentStore)
const { formatMoney } = useMoneyFormatter()

const drawerRef = ref<InstanceType<typeof InvestmentMovementForm> | null>(null)

const yearMovements = computed(() =>
  financialStateStore.state.transactions.filter(
    (tx): tx is Transaction =>
      tx.type === 'investment' && parseTransactionYear(tx.date) === ui.investmentYearFilter,
  ),
)

const facts = computed(() => {
  let bought = 0
  let sold = 0
  let fees = 0
  let pending = 0
  for (const tx of yearMovements.value) {
    const fee = Number(tx.fee) || 0
    const operationGross = (Number(tx.units) || 0) * (Number(tx.unitPrice) || 0)
    // Movements without an operation (legacy rows) only carry the amount.
    const gross = operationGross > 0 ? operationGross : Math.abs(Number(tx.amount) || 0)
    if (tx.side === 'sell') sold += gross
    else bought += gross
    fees += fee
    if (!tx.declared) pending += 1
  }
  return { bought, sold, fees, pending }
})

interface MonthGroup {
  key: string
  title: string
  summary: string
  rows: InvestmentMovementRow[]
}

const groups = computed<MonthGroup[]>(() => {
  const byMonth = new Map<string, InvestmentMovementRow[]>()
  for (const row of movementRows.value) {
    const key = String(row.tx.date).slice(0, 7)
    const list = byMonth.get(key) ?? []
    list.push(row)
    byMonth.set(key, list)
  }
  return Array.from(byMonth, ([key, rows]) => {
    const [year, month] = key.split('-')
    const name = MONTHS[Number(month) - 1] ?? ''
    const net = rows.reduce((sum, row) => sum + Number(row.tx.amount || 0), 0)
    const count = `${rows.length} ${rows.length === 1 ? 'movimiento' : 'movimientos'}`
    return {
      key,
      title: `${name.charAt(0)}${name.slice(1).toLowerCase()} ${year}`,
      summary: `${count} · ${net >= 0 ? 'neto invertido' : 'neto retirado'} ${formatMoney(Math.abs(net))}`,
      rows,
    }
  })
})

function dayLabel(date: string): string {
  const parsed = new Date(`${date}T00:00:00`)
  if (Number.isNaN(parsed.getTime())) return date
  return new Intl.DateTimeFormat('es-ES', { day: '2-digit', month: 'short' }).format(parsed).replace('.', '')
}

function units(value: number | undefined): string {
  return Number(value) > 0
    ? Number(value).toLocaleString('es-ES', { minimumFractionDigits: 4, maximumFractionDigits: 8 })
    : '—'
}

function unitPrice(value: number | undefined): string {
  return Number(value) > 0 ? `${formatMoney(Number(value))} / título` : ''
}

function totalText(tx: Transaction): string {
  const value = Math.abs(Number(tx.amount) || 0)
  return tx.side === 'sell' ? `+${formatMoney(value)}` : formatMoney(value)
}

function onYearChange(event: Event): void {
  investmentStore.setYearFilter(Number((event.target as HTMLSelectElement).value))
}
</script>

<template>
  <div
    id="investment-tab-movements"
    class="inv-page"
    :hidden="!isActive"
    data-investment-tab-panel="movements"
    role="tabpanel"
  >
    <div class="inv-toolbar">
      <div class="inv-toolbar__group">
        <label class="inv-field">
          Año
          <span class="inv-select">
            <select id="investment-year-filter" name="investmentYearFilter" :value="ui.investmentYearFilter" @change="onYearChange">
              <option v-for="year in yearOptions" :key="year" :value="year">{{ year }}</option>
            </select>
          </span>
        </label>
        <label class="inv-chip">
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
      <button id="open-investment-movement" type="button" class="inv-primary" @click="drawerRef?.open()">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>
        Nuevo movimiento
      </button>
    </div>

    <section class="inv-facts" :aria-label="`Resumen de ${ui.investmentYearFilter}`">
      <div>
        <p>Comprado en {{ ui.investmentYearFilter }}</p>
        <strong>{{ formatMoney(facts.bought) }}</strong>
      </div>
      <div>
        <p>Vendido</p>
        <strong>{{ formatMoney(facts.sold) }}</strong>
      </div>
      <div>
        <p>Comisiones</p>
        <strong>{{ formatMoney(facts.fees) }}</strong>
      </div>
      <div>
        <p>Sin declarar</p>
        <strong :class="{ 'is-warn': facts.pending > 0 }">{{ facts.pending }}<small>movimientos</small></strong>
      </div>
    </section>

    <section class="inv-doc" :aria-label="`Movimientos de inversión de ${ui.investmentYearFilter}`">
      <div class="inv-ledger-wrap">
        <table class="inv-ledger" style="margin-top: 18px">
          <thead>
            <tr>
              <th scope="col">Fecha</th>
              <th scope="col">Activo</th>
              <th scope="col" class="is-right inv-hide-sm">Títulos</th>
              <th scope="col" class="is-right">Total</th>
              <th scope="col" class="inv-hide-sm">Broker</th>
              <th scope="col">Declaración</th>
              <th scope="col" class="is-right">Acciones</th>
            </tr>
          </thead>
          <tbody id="investment-tx-table-body">
            <tr v-if="!groups.length">
              <td colspan="7" class="inv-empty">
                {{
                  ui.investmentOnlyUndeclared
                    ? `Todo declarado en ${ui.investmentYearFilter}. No queda ningún movimiento pendiente.`
                    : 'Sin movimientos de inversión para este filtro.'
                }}
              </td>
            </tr>
            <template v-for="group in groups" :key="group.key">
              <tr class="inv-month-row">
                <td colspan="7">
                  <h4>{{ group.title }}<small class="inv-num">{{ group.summary }}</small></h4>
                </td>
              </tr>
              <tr v-for="row in group.rows" :key="row.tx.id" :data-movement-id="row.tx.id">
                <td>
                  <span class="inv-cell-stack">
                    <span style="font-weight: 600">{{ dayLabel(String(row.tx.date)) }}</span>
                    <small class="inv-num">{{ row.tx.time || '--:--' }}</small>
                  </span>
                </td>
                <td>
                  <span class="inv-cell-stack">
                    <span style="display: flex; align-items: center; gap: 10px">
                      <span style="font-family: 'DM Mono', monospace; font-weight: 500">{{ row.tx.symbol || row.tx.category || '-' }}</span>
                      <span class="inv-pill" :class="{ 'is-sell': row.tx.side === 'sell' }" data-operation>{{ row.sideLabel }}</span>
                    </span>
                    <small>{{ row.tx.category || 'Sin categoría' }}</small>
                  </span>
                </td>
                <td class="is-right inv-hide-sm">
                  <span style="display: inline-flex; align-items: center; gap: 8px">
                    <span v-if="(row.tx.movementCurrency || 'EUR').toUpperCase() !== 'EUR'" class="inv-tag">{{ row.tx.movementCurrency }}</span>
                    <span class="inv-num">{{ units(row.tx.units) }}</span>
                  </span>
                </td>
                <td class="is-right">
                  <span class="inv-cell-stack" style="justify-items: end">
                    <span class="inv-num" :class="{ 'inv-gain': row.tx.side === 'sell' }" style="font-weight: 500">{{ totalText(row.tx) }}</span>
                    <small v-if="unitPrice(row.tx.unitPrice)" class="inv-num">{{ unitPrice(row.tx.unitPrice) }}</small>
                  </span>
                </td>
                <td class="inv-hide-sm">{{ row.account }}</td>
                <td>
                  <button
                    type="button"
                    class="inv-decl"
                    :class="{ 'is-declared': row.declared }"
                    :aria-pressed="row.declared"
                    aria-label="Cambiar declarado"
                    @click="investmentStore.toggleDeclared(row.tx.id)"
                  >
                    <svg v-if="row.declared" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12l5 5 9-10" /></svg>
                    <i v-else></i>
                    {{ row.declared ? 'Declarado' : 'Pendiente' }}
                  </button>
                </td>
                <td>
                  <div class="inv-actions">
                    <button
                      v-if="stockEventsStore.canSyncSymbol(row.tx.symbol || '')"
                      class="inv-icon-btn"
                      type="button"
                      :aria-label="`Reenviar movimiento del ${row.tx.date} a Stock Events`"
                      title="Reenviar a Stock Events"
                      @click="investmentStore.resyncMovement(row.tx.id)"
                    >
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 11a8 8 0 0 0-14.3-4.9L4 8" /><path d="M4 4v4h4" /><path d="M4 13a8 8 0 0 0 14.3 4.9L20 16" /><path d="M20 20v-4h-4" /></svg>
                    </button>
                    <button
                      class="inv-icon-btn"
                      type="button"
                      :aria-label="`Editar movimiento del ${row.tx.date}`"
                      @click="drawerRef?.open(row.tx)"
                    >
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 20h4L19 9l-4-4L4 16z" /><path d="M14 6l4 4" /></svg>
                    </button>
                    <button
                      class="inv-icon-btn is-danger"
                      type="button"
                      :aria-label="`Eliminar movimiento del ${row.tx.date}`"
                      @click="investmentStore.deleteMovement(row.tx.id)"
                    >
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 7h16" /><path d="M10 11v6M14 11v6" /><path d="M6 7l1 13h10l1-13" /><path d="M9 7V4h6v3" /></svg>
                    </button>
                  </div>
                </td>
              </tr>
            </template>
          </tbody>
        </table>
      </div>
    </section>

    <InvestmentMovementForm ref="drawerRef" />
  </div>
</template>
