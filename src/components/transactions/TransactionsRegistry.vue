<script setup lang="ts">
import { computed, ref } from 'vue'

import BulkActionBar from './BulkActionBar.vue'
import RegistryBreakdown from './RegistryBreakdown.vue'
import RegistryLedger from './RegistryLedger.vue'
import RegistryMonthBand from './RegistryMonthBand.vue'
import RegistryToolbar from './RegistryToolbar.vue'
import PendingMovementsPanel from '../recurring/PendingMovementsPanel.vue'
import BaseButton from '../ui/BaseButton.vue'
import type { Transaction } from '../../scripts/types'
import { useMovementsStore } from '../../stores/movements'

// The Registro tab: the month's net, pending movements to review, the
// filters, the year's ledger by month and the month by category.
const emit = defineEmits<{ edit: [tx: Transaction] }>()

const movementsStore = useMovementsStore()
// On small screens checkboxes only show in selection mode.
const selecting = ref(false)
const barVisible = computed(() => selecting.value || movementsStore.selectedTransactions.length > 0)

function stopSelecting(): void {
  selecting.value = false
  movementsStore.clearSelection()
}
</script>

<template>
  <div class="grid gap-6">
    <RegistryMonthBand />
    <PendingMovementsPanel />
    <RegistryToolbar />
    <div class="-mb-3 flex justify-end sm:hidden">
      <BaseButton
        variant="ghost"
        :aria-pressed="selecting"
        @click="selecting ? stopSelecting() : (selecting = true)"
      >
        {{ selecting ? 'Listo' : 'Seleccionar' }}
      </BaseButton>
    </div>
    <RegistryLedger :selecting="selecting" @edit="emit('edit', $event)" />
    <RegistryBreakdown />
    <BulkActionBar :visible="barVisible" @close="selecting = false" />
  </div>
</template>
