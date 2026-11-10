<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'

import { transactionsToCsv } from '../../../domain/data/view-model'
import { periodError, previousMonthPeriod } from '../../../domain/monthly-report/period'
import {
  buildMonthlyReportViewModel,
  selectReportTransactions,
} from '../../../domain/monthly-report/view-model'
import { downloadBlob } from '../../../lib/client/download'
import { downloadMonthlyReportPdf } from '../../../lib/client/monthly-report-pdf'
import { formatMoney } from '../../../lib/format'
import { todayISO } from '../../../scripts/utils'
import { useFinancialStateStore } from '../../../stores/financial-state'
import { useUiStore } from '../../../stores/ui'
import NeonButton from '../../ui/NeonButton.vue'
import NeonDetailPanel from '../../ui/NeonDetailPanel.vue'

// «Exportar» of the registry in the new design: pick a period, see what it
// covers and download it as a PDF or as the CSV of the same movements. Same
// report as the old design (ADR 0009): it takes the registry's search, type and
// account filters and ignores its year.
const open = defineModel<boolean>('open', { required: true })

const financialState = useFinancialStateStore()
const ui = useUiStore().ui

const today = ref(todayISO())
const period = reactive({ from: '', to: '' })
const generating = ref(false)
const downloadFailed = ref(false)

function resetPeriod(): void {
  Object.assign(period, previousMonthPeriod(today.value))
}
resetPeriod()

watch(open, (isOpen) => {
  if (!isOpen) return
  today.value = todayISO()
  resetPeriod()
  downloadFailed.value = false
})

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

const fieldClass =
  'bg-panel border-ctrl-line text-text outline-accent rounded-field min-h-[46px] w-full min-w-0 border px-3.5 text-[16px] font-bold focus-visible:outline-2 focus-visible:outline-offset-2'
const labelClass = 'text-muted grid min-w-0 gap-1.5 text-[13px] font-bold'
</script>

<template>
  <NeonDetailPanel v-model:open="open" kicker="Exportar" title="Informe mensual">
    <fieldset class="grid gap-3">
      <legend class="text-muted text-label tracking-label mbe-3 font-extrabold uppercase">
        Periodo
      </legend>
      <div class="grid grid-cols-2 gap-3">
        <label :class="labelClass">
          Desde
          <input
            v-model="period.from"
            type="date"
            name="reportFrom"
            :max="today"
            required
            :class="fieldClass"
          />
        </label>
        <label :class="labelClass">
          Hasta
          <input
            v-model="period.to"
            type="date"
            name="reportTo"
            :max="today"
            required
            :class="fieldClass"
          />
        </label>
      </div>
      <div>
        <NeonButton data-report-previous-month @click="resetPeriod">Mes anterior</NeonButton>
      </div>
      <p v-if="error" class="text-loss text-[14px] font-bold" role="alert" data-report-error>
        {{ error }}
      </p>
    </fieldset>

    <section v-if="report" class="grid gap-3" aria-label="Qué incluye el informe">
      <div class="bg-panel2 rounded-card grid gap-2 px-5 py-4" data-report-summary>
        <p class="text-muted text-[14px] font-bold">{{ report.periodLabel }} · {{ countLabel }}</p>
        <dl class="grid grid-cols-2 gap-3">
          <div class="grid gap-0.5">
            <dt class="text-muted text-[13px] font-bold">Ingresos</dt>
            <dd class="font-display text-gain text-[18px] font-semibold tabular-nums">
              {{ formatMoney(report.summary.income, report.currency) }}
            </dd>
          </div>
          <div class="grid gap-0.5">
            <dt class="text-muted text-[13px] font-bold">Gastos</dt>
            <dd class="font-display text-text text-[18px] font-semibold tabular-nums">
              {{ formatMoney(report.summary.expense, report.currency) }}
            </dd>
          </div>
        </dl>
      </div>
      <p v-if="report.appliedFilters.length" class="text-soft text-[14px]" data-report-filters>
        Filtros activos: {{ report.appliedFilters.join(' · ') }}
      </p>
      <p v-else class="text-soft text-[14px]">Incluye todos los movimientos del periodo.</p>
      <p v-if="!report.hasMovements" class="text-soft text-[14px]">
        No hay movimientos en este periodo; el informe saldrá con ceros.
      </p>
    </section>

    <p v-if="downloadFailed" class="text-loss text-[14px] font-bold" role="alert">
      No se pudo generar el PDF. Comprueba la conexión e inténtalo de nuevo.
    </p>

    <template #footer>
      <NeonButton :disabled="!report" data-report-csv @click="downloadCsv">
        Descargar CSV
      </NeonButton>
      <NeonButton
        variant="primary"
        :disabled="!report || generating"
        data-report-pdf
        @click="downloadPdf"
      >
        {{ generating ? 'Generando…' : 'Descargar PDF' }}
      </NeonButton>
    </template>
  </NeonDetailPanel>
</template>
