<script setup lang="ts">
import { computed, ref, useTemplateRef } from 'vue'

import { useEntrySheet } from '../../composables/useEntrySheet'
import { useMoneyFormatter } from '../../composables/useMoneyFormatter'
import { signedAmount } from '../../domain/transactions/registry'
import { formatDayMonth, formatDueLabel } from '../../lib/format'
import type { PendingMovement } from '../../scripts/types'
import { todayISO } from '../../scripts/utils'
import { useFinancialStateStore } from '../../stores/financial-state'
import { useRecurringStore } from '../../stores/recurring'
import { categoryIcon } from '../ui/category-icons'
import NeonButton from '../ui/NeonButton.vue'
import NeonCategoryIcon from '../ui/NeonCategoryIcon.vue'
import NeonDetailPanel from '../ui/NeonDetailPanel.vue'
import NeonEmptyState from '../ui/NeonEmptyState.vue'
import { usePendingSheet } from './pending-sheet'

// «Por confirmar» in the top bar of the mobile frame (DESIGN.md, Layout: the
// mobile frame uses bottom sheets for it): the movements still waiting for a
// yes (recurring ones that came due) as a list in a sheet. Each row confirms
// as it is, and «Confirmar los N» takes them all. Picking a row opens its
// detail, where it is also skipped, or edited in the entry sheet and confirmed
// there in one step. The dashboard opens this same sheet from its figure; on
// desktop it has its own «Por confirmar» block
// (src/neon/dashboard/DashboardPendingCard.vue).
const recurringStore = useRecurringStore()
const financialStateStore = useFinancialStateStore()
const { formatMovementAmount, formatSignedMoney } = useMoneyFormatter()
const { openPendingEdit } = useEntrySheet()

const pending = computed(() => recurringStore.openPendingMovements)
const triggerLabel = computed(() => {
  const count = pending.value.length
  return count === 0 ? 'Por confirmar' : `Por confirmar, ${count} pendientes`
})

const { open: listOpen } = usePendingSheet()
const confirmAllLabel = computed(() => {
  const count = pending.value.length
  const total = pending.value.reduce((sum, item) => sum + signedAmount(item), 0)
  return `${count === 1 ? 'Confirmar 1' : `Confirmar los ${count}`} · ${formatSignedMoney(total)}`
})
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
  listOpen.value = false
  detailOpen.value = true
}

/** Confirms every open pending movement, oldest first, as «Confirmar» one by one would. */
function confirmAll(): void {
  for (const id of pending.value.map((item) => item.id)) recurringStore.confirmPending(id)
}

function confirm(): void {
  if (!detail.value) return
  recurringStore.confirmPending(detail.value.id)
  detailOpen.value = false
}

function edit(): void {
  if (!detail.value) return
  // The detail slides out while the sheet comes in; the focus goes back to the
  // trigger once the sheet closes, as the pressed button leaves with the panel.
  openPendingEdit(detail.value, triggerButton.value)
  detailOpen.value = false
}

function skip(): void {
  if (!detail.value) return
  recurringStore.skipPending(detail.value.id)
  detailOpen.value = false
}
</script>

<template>
  <button
    ref="triggerButton"
    type="button"
    class="text-soft outline-accent relative grid size-12 place-items-center rounded-full focus-visible:outline-2 focus-visible:outline-offset-2 motion-safe:transition-transform motion-safe:duration-160 motion-safe:ease-out motion-safe:active:scale-[0.97]"
    :aria-label="triggerLabel"
    aria-haspopup="dialog"
    :aria-expanded="listOpen"
    data-pending-trigger
    @click="listOpen = true"
  >
    <svg
      class="size-5.5"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
    >
      <path
        d="M10 6h10M10 12h10M10 18h10M3.5 6l1.5 1.5L7.5 5M3.5 12l1.5 1.5L7.5 11M3.5 18l1.5 1.5L7.5 17"
      />
    </svg>
    <span
      v-if="pending.length"
      class="bg-accent text-on-accent font-display absolute inset-e-1.25 inset-bs-1.25 grid h-4.5 min-w-4.5 place-items-center rounded-full px-1 text-xs leading-none font-bold"
      aria-hidden="true"
    >
      {{ pending.length }}
    </span>
  </button>

  <NeonDetailPanel v-model:open="listOpen" title="Por confirmar">
    <p class="text-muted text-meta">
      Vencimientos de tus reglas recurrentes. No cuentan en lo que te queda hasta que los confirmes.
    </p>
    <ul v-if="pending.length" class="grid">
      <li
        v-for="item in pending"
        :key="item.id"
        class="border-line grid min-h-16 grid-cols-[minmax(0,1fr)_auto] items-center border-t py-2.5"
        :data-pending-item="item.id"
      >
        <button
          type="button"
          class="outline-accent rounded-field grid min-h-12 grid-cols-[40px_minmax(0,1fr)_auto] items-center gap-x-3 text-start focus-visible:outline-2 focus-visible:outline-offset-2"
          :aria-label="`Revisar ${item.description}, ${formatMovementAmount(item)}, ${dueLabel(item)}`"
          @click="openDetail(item)"
        >
          <NeonCategoryIcon :path="categoryIcon(item.type, item.category)" />
          <span class="grid min-w-0">
            <span class="text-text text-row truncate font-bold">{{ item.description }}</span>
            <span class="text-muted text-meta truncate">{{ dueLabel(item) }}</span>
          </span>
          <span class="flex items-center gap-0.5">
            <span
              class="font-display text-figure-row font-semibold whitespace-nowrap tabular-nums"
              :class="item.type === 'income' ? 'text-gain' : 'text-text'"
            >
              {{ formatMovementAmount(item) }}
            </span>
            <svg
              class="text-muted size-4"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
              aria-hidden="true"
            >
              <path d="M9 6l6 6-6 6" />
            </svg>
          </span>
        </button>
        <NeonButton
          class="-me-4"
          :aria-label="`Confirmar ${item.description}`"
          @click="recurringStore.confirmPending(item.id)"
        >
          Confirmar
        </NeonButton>
      </li>
    </ul>
    <NeonEmptyState v-else>No queda nada por confirmar.</NeonEmptyState>
    <template v-if="pending.length" #footer>
      <button
        type="button"
        class="bg-accent text-on-accent font-display outline-text rounded-pill min-h-14 w-full px-[22px] text-sm font-bold focus-visible:outline-2 focus-visible:outline-offset-2 motion-safe:transition-transform motion-safe:duration-160 motion-safe:ease-out motion-safe:active:scale-[0.97]"
        data-pending-confirm-all
        @click="confirmAll"
      >
        {{ confirmAllLabel }}
      </button>
    </template>
  </NeonDetailPanel>

  <NeonDetailPanel
    v-model:open="detailOpen"
    kicker="Por confirmar"
    :title="detail?.description ?? ''"
    :return-focus="triggerButton"
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
        class="text-text outline-accent rounded-pill min-h-11 px-4 text-sm font-extrabold underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2 motion-safe:transition-transform motion-safe:duration-160 motion-safe:ease-out motion-safe:active:scale-[0.97]"
        data-pending-edit
        @click="edit"
      >
        Editar
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
