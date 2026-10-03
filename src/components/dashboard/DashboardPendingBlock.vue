<script setup lang="ts">
import { computed } from 'vue'

import DashboardBlock from './DashboardBlock.vue'
import BaseButton from '../ui/BaseButton.vue'
import PillTag from '../ui/PillTag.vue'
import { TONE_TEXT } from '../ui/tone'
import { useMoneyFormatter } from '../../composables/useMoneyFormatter'
import { signedAmount } from '../../domain/transactions/registry'
import { formatDayMonth, formatDueLabel } from '../../lib/format'
import { todayISO } from '../../scripts/utils'
import { useRecurringStore } from '../../stores/recurring'

// 03 · POR HACER: the open pending movements as cards to confirm or skip.
// Editing and cancelling stay in the Movimientos registry.
const recurringStore = useRecurringStore()
const { formatSignedMoney } = useMoneyFormatter()
const pending = computed(() => recurringStore.openPendingMovements)
</script>

<template>
  <DashboardBlock
    kicker="03 · POR HACER"
    title="Pendientes"
    title-id="dashboard-pending-title"
    subtle
    data-dashboard-pending
  >
    <template #badge>
      <PillTag v-if="pending.length" tone="accent">{{ pending.length }}</PillTag>
    </template>
    <p class="text-text-muted -mt-3 text-sm">No cuentan hasta que los confirmes.</p>
    <ul v-if="pending.length" class="grid gap-2.5">
      <li
        v-for="item in pending"
        :key="item.id"
        class="border-line bg-panel grid gap-3 rounded-md border px-4 py-3.5"
        :data-pending-item="item.id"
      >
        <div class="flex items-start justify-between gap-3">
          <span class="grid min-w-0 gap-0.5">
            <span class="text-text-main font-bold">{{ item.description }}</span>
            <span class="text-text-muted text-sm">
              {{ formatDueLabel(item.occurrenceDate, todayISO()) }} ·
              {{ formatDayMonth(item.occurrenceDate) }}
            </span>
          </span>
          <span
            class="font-display shrink-0 font-medium tabular-nums"
            :class="item.type === 'income' ? TONE_TEXT.gain : 'text-text-main'"
          >
            {{ formatSignedMoney(signedAmount(item)) }}
          </span>
        </div>
        <div class="grid grid-cols-[minmax(0,1fr)_auto] gap-1.5">
          <BaseButton
            variant="primary"
            :aria-label="`Confirmar ${item.description}`"
            @click="recurringStore.confirmPending(item.id)"
          >
            Confirmar
          </BaseButton>
          <BaseButton
            variant="ghost"
            :aria-label="`Saltar este vencimiento de ${item.description}`"
            @click="recurringStore.skipPending(item.id)"
          >
            Saltar
          </BaseButton>
        </div>
      </li>
    </ul>
    <p v-else class="text-text-muted py-6 text-center" data-pending-empty>
      Todo al día. Aún no hay pendientes.
    </p>
  </DashboardBlock>
</template>
