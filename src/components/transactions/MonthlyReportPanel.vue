<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'

import BaseButton from '../ui/BaseButton.vue'
import BaseInput from '../ui/BaseInput.vue'
import SidePanel from '../ui/SidePanel.vue'
import { transactionsToCsv } from '../../domain/data/view-model'
import { periodError, previousMonthPeriod } from '../../domain/monthly-report/period'
import {
  buildMonthlyReportViewModel,
  selectReportTransactions,
} from '../../domain/monthly-report/view-model'
import { downloadBlob } from '../../lib/client/download'
import { downloadMonthlyReportPdf } from '../../lib/client/monthly-report-pdf'
import { formatMoney } from '../../lib/format'
import { todayISO } from '../../scripts/utils'
import { useFinancialStateStore } from '../../stores/financial-state'
import { useUiStore } from '../../stores/ui'

// The monthly report: pick the period, check what it covers and download it as a PDF or as the
// CSV of the same movements. It takes the registry's search, type and account filters and ignores
// its year (ADR 0009 for how the PDF is made).
const open = defineModel<boolean>('open', { required: true })

const financialState = useFinancialStateStore()
const ui = useUiStore().ui

const today = ref(todayISO())
const period = reactive({ from: '', to: '' })
const generating = ref(false)
const downloadFailed = ref(false)

watch(open, (isOpen) => {
  if (!isOpen) return
  today.value = todayISO()
  resetPeriod()
  downloadFailed.value = false
})

function resetPeriod(): void {
  Object.assign(period, previousMonthPeriod(today.value))
}
resetPeriod()

const error = computed(() => periodError(period, today.value))
const report = computed(() =>
  error.value
    ? null
    : buildMonthlyReportViewModel({
        state: financialState.state,
        period,
        filters: ui.txFilters,
        today: today.value,
      }),
)
const countLabel = computed(() => {
  const count = report.value?.movementCount ?? 0
  return `${count} ${count === 1 ? 'movimiento' : 'movimientos'}`
})

function downloadCsv(): void {
  if (!report.value) return
  const rows = selectReportTransactions({
    transactions: financialState.state.transactions,
    period,
    filters: ui.txFilters,
  })
  downloadBlob(
    transactionsToCsv(rows),
    'text/csv;charset=utf-8',
    `movimientos-${period.from}-${period.to}.csv`,
  )
}

async function downloadPdf(): Promise<void> {
  if (!report.value || generating.value) return
  generating.value = true
  downloadFailed.value = false
  try {
    await downloadMonthlyReportPdf(report.value, { from: period.from, to: period.to })
  } catch {
    downloadFailed.value = true
  } finally {
    generating.value = false
  }
}
</script>

<template>
  <SidePanel
    id="monthly-report-panel"
    v-model:open="open"
    kicker="Exportar"
    title="Informe mensual"
    title-id="monthly-report-panel-title"
  >
    <fieldset class="grid gap-3.5">
      <legend class="text-text-muted mb-3 text-xs font-bold tracking-widest uppercase">
        Periodo
      </legend>
      <div class="grid grid-cols-2 gap-3">
        <BaseInput
          v-model="period.from"
          label="Desde"
          name="reportFrom"
          type="date"
          :max="today"
          required
        />
        <BaseInput
          v-model="period.to"
          label="Hasta"
          name="reportTo"
          type="date"
          :max="today"
          required
        />
      </div>
      <div>
        <BaseButton variant="ghost" data-report-previous-month @click="resetPeriod">
          Mes anterior
        </BaseButton>
      </div>
      <p v-if="error" class="text-loss text-sm" role="alert" data-report-error>{{ error }}</p>
    </fieldset>

    <section v-if="report" class="grid gap-3" aria-label="Qué incluye el informe">
      <div
        class="bg-ink border-ink-line text-ink-text flex flex-wrap items-center justify-between gap-x-4 gap-y-2 rounded-md border px-5 py-4"
        data-report-summary
      >
        <span class="text-ink-muted text-sm">{{ report.periodLabel }} · {{ countLabel }}</span>
        <p class="font-display flex gap-4 text-sm tabular-nums">
          <span>Ingresos {{ formatMoney(report.summary.income, report.currency) }}</span>
          <span>Gastos {{ formatMoney(report.summary.expense, report.currency) }}</span>
        </p>
      </div>
      <p v-if="report.appliedFilters.length" class="text-text-muted text-sm" data-report-filters>
        Filtros activos: {{ report.appliedFilters.join(' · ') }}
      </p>
      <p v-else class="text-text-muted text-sm">Incluye todos los movimientos del periodo.</p>
      <p v-if="!report.hasMovements" class="text-text-muted text-sm">
        No hay movimientos en este periodo; el informe saldrá con ceros.
      </p>
    </section>

    <p v-if="downloadFailed" class="text-loss text-sm" role="alert" data-report-download-error>
      No se pudo generar el PDF. Comprueba la conexión e inténtalo de nuevo.
    </p>

    <template #footer>
      <BaseButton
        class="flex-1 sm:flex-none"
        :disabled="!report"
        data-report-csv
        @click="downloadCsv"
      >
        Descargar CSV
      </BaseButton>
      <BaseButton
        class="flex-1 sm:flex-none"
        variant="primary"
        :disabled="!report || generating"
        data-report-pdf
        @click="downloadPdf"
      >
        {{ generating ? 'Generando…' : 'Descargar PDF' }}
      </BaseButton>
    </template>
  </SidePanel>
</template>
