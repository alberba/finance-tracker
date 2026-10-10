<script setup lang="ts">
import { storeToRefs } from 'pinia'
import { computed, ref } from 'vue'

import AppSection from '../ui/AppSection.vue'
import BaseButton from '../ui/BaseButton.vue'
import DocumentSurface from '../ui/DocumentSurface.vue'
import NumberedBlock from '../ui/NumberedBlock.vue'
import PageHeader from '../ui/PageHeader.vue'
import WealthBand from '../wealth/WealthBand.vue'
import WealthCalcPanel, { type WealthCalcTarget } from '../wealth/WealthCalcPanel.vue'
import WealthHistoryTable from '../wealth/WealthHistoryTable.vue'
import WealthSnapshotLedger from '../wealth/WealthSnapshotLedger.vue'
import { useMoneyFormatter } from '../../composables/useMoneyFormatter'
import { useSnapshotEdit } from '../../composables/useSnapshotEdit'
import { useToast } from '../../composables/useToast'
import { formatSnapshotInput, type SnapshotRowViewModel } from '../../domain/wealth/view-model'
import type { SnapshotKind } from '../../scripts/types'
import { useFinancialStateStore } from '../../stores/financial-state'
import { useWealthStore } from '../../stores/wealth'

withDefaults(defineProps<{ isActive?: boolean }>(), { isActive: false })

const wealthStore = useWealthStore()
const financialStateStore = useFinancialStateStore()
const { viewModel, snapshotMonth } = storeToRefs(wealthStore)
const { formatMoney } = useMoneyFormatter()
const { showToast } = useToast()

const edit = useSnapshotEdit({
  groups: computed(() => viewModel.value.groups),
  context: computed(() => `${financialStateStore.year}:${snapshotMonth.value}`),
  commit: (edits) => wealthStore.saveSnapshot(edits),
})
const { totals, changes } = edit

const month = computed({
  get: () => snapshotMonth.value,
  set: (value: number) => wealthStore.setMonth(value),
})
const monthName = computed(() => viewModel.value.months[snapshotMonth.value]?.name ?? '')
const status = computed(() => {
  if (changes.value > 0) return { saved: false, text: 'Con cambios sin guardar' }
  if (viewModel.value.months[snapshotMonth.value]?.saved) return { saved: true, text: 'Guardado' }
  return { saved: false, text: 'Sin guardar: es el saldo calculado' }
})

function save(): void {
  if (!edit.save()) showToast('Corrige los saldos no válidos antes de guardar.')
}

const calcOpen = ref(false)
const calcTarget = ref<WealthCalcTarget | null>(null)

function openCalc(kind: SnapshotKind, row: SnapshotRowViewModel): void {
  calcTarget.value = {
    kind,
    id: row.id,
    name: row.name,
    current: edit.field(kind, row.id)?.effective ?? row.calculated,
    calculated: row.calculated,
    opening: row.opening,
  }
  calcOpen.value = true
}

function applyCalc(kind: SnapshotKind, id: string, value: number): void {
  edit.set(kind, id, formatSnapshotInput(value))
}
</script>

<template>
  <AppSection id="wealth" :is-active="isActive">
    <div class="mx-auto grid w-full max-w-7xl min-w-0 gap-6">
      <PageHeader
        :kicker="`Balance patrimonial · ${financialStateStore.year}`"
        title="Patrimonio"
        title-id="wealth-title"
        lede="Apunta cada mes el saldo real de tus cuentas, inversiones y deudas."
      >
        <template #aside>
          <BaseButton variant="primary" data-save-snapshot @click="save">
            <svg
              class="size-4"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2.4"
              stroke-linecap="round"
              stroke-linejoin="round"
              aria-hidden="true"
            >
              <path d="M5 12l5 5L20 7" />
            </svg>
            Guardar {{ monthName }}
          </BaseButton>
        </template>
      </PageHeader>

      <WealthBand
        v-model:month="month"
        :totals="totals"
        :months="viewModel.months"
        :month-name="monthName"
        :status="status"
        :format-money="formatMoney"
      />

      <DocumentSurface>
        <NumberedBlock
          number="01"
          :title="`Saldos de ${monthName}`"
          title-id="wealth-snapshot-title"
          description="Lo que dejes vacío toma el saldo calculado con tus movimientos."
        >
          <template v-if="changes > 0" #actions>
            <div role="status" class="flex items-center gap-1.5" data-snapshot-changes>
              <span
                class="bg-accent/15 text-text-main flex items-center gap-2 rounded-full px-3 py-1.5 text-sm font-bold"
              >
                <span class="bg-accent size-2 rounded-full" aria-hidden="true"></span>
                {{ changes === 1 ? '1 cambio sin guardar' : `${changes} cambios sin guardar` }}
              </span>
              <BaseButton variant="ghost" @click="edit.discard">Descartar</BaseButton>
            </div>
          </template>
          <WealthSnapshotLedger
            :groups="viewModel.groups"
            :field="edit.field"
            :totals="totals"
            :format-money="formatMoney"
            @update="edit.set"
            @calculate="openCalc"
          />
        </NumberedBlock>

        <NumberedBlock
          number="02"
          title="Cada cuenta, mes a mes"
          title-id="wealth-history-title"
          :description="`Saldos al cierre de ${financialStateStore.year}, en euros redondeados. Pulsa un mes para abrir su snapshot.`"
        >
          <WealthHistoryTable
            v-model:month="month"
            :rows="viewModel.history.rows"
            :months="viewModel.months"
            :shown="viewModel.history.months"
          />
        </NumberedBlock>
      </DocumentSurface>
    </div>

    <WealthCalcPanel
      v-model:open="calcOpen"
      :target="calcTarget"
      :month-name="monthName"
      :format-money="formatMoney"
      :currency="financialStateStore.state.currency"
      @apply="applyCalc"
    />
  </AppSection>
</template>
