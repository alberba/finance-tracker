<script setup lang="ts">
import SetupRequirement from '../onboarding/SetupRequirement.vue'
import { storeToRefs } from 'pinia'
import { computed, reactive, ref, watch } from 'vue'

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
import {
  formatSnapshotInput,
  parseSnapshotInput,
  parseSnapshotKey,
  snapshotKey,
  snapshotTotals,
  type SnapshotRowViewModel,
} from '../../domain/wealth/view-model'
import type { SnapshotKind } from '../../scripts/types'
import { useFinancialStateStore } from '../../stores/financial-state'
import { useWealthStore } from '../../stores/wealth'

withDefaults(defineProps<{ isActive?: boolean }>(), { isActive: false })

const wealthStore = useWealthStore()
const financialStateStore = useFinancialStateStore()
const { viewModel, snapshotMonth } = storeToRefs(wealthStore)
const { formatMoney } = useMoneyFormatter()

// The snapshot fields are a draft until "Guardar" commits them; `saved` holds
// what the month has stored, to count and discard the changes.
const inputs = reactive<Record<string, string>>({})
const saved = ref<Record<string, string>>({})

function reset(): void {
  const next: Record<string, string> = {}
  for (const group of viewModel.value.groups) {
    for (const row of group.rows) {
      next[snapshotKey(group.kind, row.id)] = formatSnapshotInput(row.snapshot)
    }
  }
  saved.value = next
  for (const key of Object.keys(inputs)) delete inputs[key]
  Object.assign(inputs, next)
}

watch(viewModel, reset, { immediate: true })

const month = computed({
  get: () => snapshotMonth.value,
  set: (value: number) => wealthStore.setMonth(value),
})
const monthName = computed(() => viewModel.value.months[snapshotMonth.value]?.name ?? '')
const needsAccount = computed(() =>
  viewModel.value.groups.every((group) => group.rows.length === 0),
)
const totals = computed(() => snapshotTotals(viewModel.value.groups, inputs))
const changes = computed(
  () => Object.keys(inputs).filter((key) => inputs[key] !== saved.value[key]).length,
)
const status = computed(() => {
  if (changes.value > 0) return { saved: false, text: 'Con cambios sin guardar' }
  if (viewModel.value.months[snapshotMonth.value]?.saved) return { saved: true, text: 'Guardado' }
  return { saved: false, text: 'Sin guardar: es el saldo calculado' }
})

function save(): void {
  if (needsAccount.value) return
  const edits = Object.entries(inputs).map(([key, value]) => ({
    ...parseSnapshotKey(key),
    value,
  }))
  wealthStore.saveSnapshot(edits)
}

const calcOpen = ref(false)
const calcTarget = ref<WealthCalcTarget | null>(null)

function openCalc(kind: SnapshotKind, row: SnapshotRowViewModel): void {
  const key = snapshotKey(kind, row.id)
  const typed = parseSnapshotInput(inputs[key] ?? '')
  calcTarget.value = {
    key,
    name: row.name,
    current: typed === null || Number.isNaN(typed) ? row.calculated : typed,
    calculated: row.calculated,
    opening: row.opening,
  }
  calcOpen.value = true
}

function applyCalc(key: string, value: number): void {
  inputs[key] = formatSnapshotInput(value)
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
          <BaseButton variant="primary" data-save-snapshot :disabled="needsAccount" @click="save">
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

      <SetupRequirement
        v-if="needsAccount"
        message="Crea una cuenta de efectivo, inversión o pasivo para editar y guardar tus saldos."
      />

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
              <BaseButton variant="ghost" @click="reset">Descartar</BaseButton>
            </div>
          </template>
          <WealthSnapshotLedger
            :groups="viewModel.groups"
            :inputs="inputs"
            :totals="totals"
            :format-money="formatMoney"
            @update="(key, value) => (inputs[key] = value)"
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
