<script setup lang="ts">
import { computed, ref, useTemplateRef } from 'vue'

import { useMoneyFormatter } from '../../composables/useMoneyFormatter'
import { formatDayMonth, formatDueLabel } from '../../lib/format'
import type { PendingMovement } from '../../scripts/types'
import { todayISO } from '../../scripts/utils'
import { useFinancialStateStore } from '../../stores/financial-state'
import { useRecurringStore } from '../../stores/recurring'
import NeonDetailPanel from '../ui/NeonDetailPanel.vue'
import NeonEmptyState from '../ui/NeonEmptyState.vue'
import NeonPopover from '../ui/NeonPopover.vue'

// «Por confirmar» in the top bar of the mobile frame, the first use of the
// shared popover, empty state and detail panel: the movements still waiting
// for a yes (recurring ones that came due) as a short list. Picking one opens
// its detail, where it is confirmed or skipped. The dashboard ticket brings the
// full «Por confirmar» block; until then this is the way to reach them.
const recurringStore = useRecurringStore()
const financialStateStore = useFinancialStateStore()
const { formatMovementAmount } = useMoneyFormatter()

const pending = computed(() => recurringStore.openPendingMovements)
const triggerLabel = computed(() => {
  const count = pending.value.length
  return count === 0 ? 'Por confirmar' : `Por confirmar, ${count} pendientes`
})

const menuOpen = ref(false)
const triggerButton = useTemplateRef<HTMLButtonElement>('triggerButton')
// The picked movement is kept as a copy so the panel still reads it while it
// slides out after confirming or skipping removed it from the list.
const detail = ref<PendingMovement | null>(null)
const detailOpen = ref(false)

function dueLabel(item: PendingMovement): string {
  return `${formatDueLabel(item.occurrenceDate, todayISO())} · ${formatDayMonth(item.occurrenceDate)}`
}

function accountName(item: PendingMovement): string {
  const account = [...financialStateStore.accounts, ...financialStateStore.investmentAssets].find(
    (candidate) => candidate.id === item.accountId,
  )
  return account?.name ?? item.accountId
}

function openDetail(item: PendingMovement): void {
  detail.value = { ...item }
  // The row that was pressed unmounts with the popover, so the panel would
  // have nowhere to give the focus back to: it goes to the trigger instead.
  triggerButton.value?.focus()
  menuOpen.value = false
  detailOpen.value = true
}

function confirm(): void {
  if (!detail.value) return
  recurringStore.confirmPending(detail.value.id)
  detailOpen.value = false
}

function skip(): void {
  if (!detail.value) return
  recurringStore.skipPending(detail.value.id)
  detailOpen.value = false
}
</script>

<template>
  <NeonPopover v-model:open="menuOpen" label="Por confirmar">
    <template #trigger="{ toggle, expanded, panelId }">
      <button
        ref="triggerButton"
        type="button"
        class="text-soft outline-accent relative grid size-12 place-items-center rounded-full focus-visible:outline-2 focus-visible:outline-offset-2 motion-safe:transition-transform motion-safe:duration-160 motion-safe:ease-out motion-safe:active:scale-[0.97]"
        :aria-label="triggerLabel"
        aria-haspopup="dialog"
        :aria-expanded="expanded"
        :aria-controls="panelId"
        data-pending-trigger
        @click="toggle"
      >
        <svg
          class="size-6"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
          aria-hidden="true"
        >
          <circle cx="12" cy="12" r="9" />
          <path d="m8.5 12.5 2.5 2.5 4.5-5" />
        </svg>
        <span
          v-if="pending.length"
          class="bg-accent text-on-accent absolute inset-e-1 inset-be-1 grid h-4.5 min-w-4.5 place-items-center rounded-full px-1 text-[11px] leading-none font-extrabold"
          aria-hidden="true"
        >
          {{ pending.length }}
        </span>
      </button>
    </template>

    <p class="text-text mbe-3 text-lg font-extrabold">Por confirmar</p>
    <ul v-if="pending.length" class="grid">
      <li v-for="item in pending" :key="item.id" :data-pending-item="item.id">
        <button
          type="button"
          class="border-line outline-accent flex min-h-16 w-full items-center justify-between gap-3 border-t py-2.5 text-start focus-visible:outline-2 focus-visible:-outline-offset-2"
          @click="openDetail(item)"
        >
          <span class="grid min-w-0">
            <span class="text-text truncate text-base font-bold">{{ item.description }}</span>
            <span class="text-muted text-meta truncate">{{ dueLabel(item) }}</span>
          </span>
          <span
            class="font-display shrink-0 text-base font-semibold tabular-nums"
            :class="item.type === 'income' ? 'text-gain' : 'text-text'"
          >
            {{ formatMovementAmount(item) }}
          </span>
        </button>
      </li>
    </ul>
    <NeonEmptyState v-else>Todo al día. No hay nada por confirmar.</NeonEmptyState>
  </NeonPopover>

  <NeonDetailPanel
    v-model:open="detailOpen"
    kicker="Por confirmar"
    :title="detail?.description ?? ''"
  >
    <dl v-if="detail" class="grid gap-4">
      <div class="grid gap-1">
        <dt class="text-muted text-label tracking-label font-extrabold uppercase">Importe</dt>
        <dd class="font-display text-2xl font-bold tracking-tight tabular-nums">
          {{ formatMovementAmount(detail) }}
        </dd>
      </div>
      <div class="grid gap-1">
        <dt class="text-muted text-label tracking-label font-extrabold uppercase">Fecha</dt>
        <dd class="font-bold">{{ dueLabel(detail) }}</dd>
      </div>
      <div class="grid gap-1">
        <dt class="text-muted text-label tracking-label font-extrabold uppercase">Cuenta</dt>
        <dd class="font-bold">{{ accountName(detail) }}</dd>
      </div>
      <div v-if="detail.category" class="grid gap-1">
        <dt class="text-muted text-label tracking-label font-extrabold uppercase">Categoría</dt>
        <dd class="font-bold">{{ detail.category }}</dd>
      </div>
    </dl>
    <template #footer>
      <button
        type="button"
        class="text-text outline-accent min-h-11 px-3 text-sm font-extrabold underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2"
        data-pending-skip
        @click="skip"
      >
        Saltar
      </button>
      <button
        type="button"
        class="bg-accent text-on-accent font-display outline-text rounded-pill min-h-11 px-[22px] text-sm font-bold focus-visible:outline-2 focus-visible:outline-offset-2"
        data-pending-confirm
        @click="confirm"
      >
        Confirmar
      </button>
    </template>
  </NeonDetailPanel>
</template>
