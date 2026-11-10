<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'

import { useMediaQuery } from '../../../composables/useMediaQuery'

import type { TransactionType } from '../../../scripts/types'
import { useFinancialStateStore } from '../../../stores/financial-state'
import { useMovementsStore } from '../../../stores/movements'
import NeonButton from '../../ui/NeonButton.vue'
import { FRAME_QUERY } from '../../ui/sheet-drag'
import { BULK_TYPES, bulkCategoryType, selectionSummary } from './registry-view-model'

// Bulk actions of the registry while selecting rows: the count and signed sum
// of the selection, change its type, account or category, select every row
// shown or delete it after confirming (it cannot be undone, as in the old
// design). «Listo», next to the filters, ends the selection. Sticks to
// the bottom of the ledger column while the ledger scrolls under it. On the
// mobile frame the month line scrolls far out of reach, so the bar carries
// its own close button (artboard «Movimientos · móvil»).
const props = defineProps<{ allShownSelected: boolean }>()
const emit = defineEmits<{ selectAll: []; done: [] }>()

const desktopFrame = useMediaQuery(FRAME_QUERY)

const movementsStore = useMovementsStore()
const financialStateStore = useFinancialStateStore()

const bulk = reactive({ type: '' as TransactionType | '', accountId: '', category: '' })
const selected = computed(() => movementsStore.selectedTransactions)
const summary = computed(() =>
  selectionSummary(selected.value, financialStateStore.currency || 'EUR'),
)
const categoryType = computed(() => bulkCategoryType(selected.value, bulk.type))
const categories = computed(() =>
  categoryType.value ? movementsStore.orderedCategories(categoryType.value) : [],
)
const hasChange = computed(() => Boolean(bulk.type || bulk.accountId || bulk.category))

watch(categories, (names) => {
  if (!names.includes(bulk.category)) bulk.category = ''
})

// The confirmation keeps the figures it asked with.
const confirming = ref<{ count: string; sum: string; total: number } | null>(null)
const deleteLabel = computed(() => {
  const total = confirming.value?.total ?? 0
  return `${total} ${total === 1 ? 'movimiento' : 'movimientos'}`
})

function askDelete(): void {
  confirming.value = { ...summary.value, total: selected.value.length }
}

function confirmDelete(): void {
  movementsStore.deleteSelected()
  confirming.value = null
}

watch(
  () => selected.value.length,
  () => {
    confirming.value = null
  },
)

function apply(): void {
  movementsStore.applyBulkChanges({ ...bulk })
  bulk.type = ''
  bulk.accountId = ''
  bulk.category = ''
}

const selectClass =
  'bg-panel border-ctrl-line text-text outline-accent rounded-pill min-h-11 min-w-0 border ps-4 pe-8 text-[14px] font-extrabold focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-50'
</script>

<template>
  <div
    class="neon-bulk bg-panel border-line rounded-card frame:inset-be-4 sticky inset-be-[118px] z-10 grid gap-3 border px-5 py-3.5"
    role="region"
    aria-label="Acciones sobre la selección"
    data-bulk-bar
  >
    <div class="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
      <p class="flex items-baseline gap-3" aria-live="polite">
        <span class="text-[15px] font-extrabold" data-bulk-count>{{ summary.count }}</span>
        <span class="font-display text-soft text-[15px] font-semibold tabular-nums">
          {{ summary.sum }}
        </span>
      </p>
      <div class="flex flex-wrap items-center gap-1">
        <NeonButton :disabled="props.allShownSelected" @click="emit('selectAll')">
          Seleccionar todo
        </NeonButton>
        <button
          v-if="!desktopFrame"
          type="button"
          class="border-ctrl-line text-soft outline-accent grid size-11 shrink-0 place-items-center rounded-full border focus-visible:outline-2 focus-visible:outline-offset-2 motion-safe:transition-transform motion-safe:duration-140 motion-safe:active:scale-[0.97]"
          aria-label="Terminar la selección"
          @click="emit('done')"
        >
          <svg
            class="size-5"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
            aria-hidden="true"
          >
            <path d="M6 6l12 12M18 6 6 18" />
          </svg>
        </button>
      </div>
    </div>
    <div
      v-if="confirming"
      class="flex flex-wrap items-center gap-x-4 gap-y-2"
      role="alertdialog"
      aria-labelledby="neon-bulk-confirm"
      data-bulk-confirm
    >
      <p id="neon-bulk-confirm" class="text-[15px]">
        <strong class="font-extrabold">¿Eliminar {{ deleteLabel }}?</strong>{{ ' ' }}
        <span class="text-soft">
          {{ confirming.total === 1 ? 'Suma' : 'Suman' }} {{ confirming.sum }}. No se puede
          deshacer.
        </span>
      </p>
      <div class="ms-auto flex items-center gap-1">
        <NeonButton @click="confirming = null">Cancelar</NeonButton>
        <NeonButton danger @click="confirmDelete">Eliminar {{ deleteLabel }}</NeonButton>
      </div>
    </div>
    <div v-else class="flex flex-wrap items-center gap-2">
      <select v-model="bulk.type" aria-label="Cambiar tipo" :class="selectClass">
        <option value="">Tipo</option>
        <option v-for="option in BULK_TYPES" :key="option.value" :value="option.value">
          {{ option.label }}
        </option>
      </select>
      <select v-model="bulk.accountId" aria-label="Mover a cuenta" :class="selectClass">
        <option value="">Cuenta</option>
        <option v-for="account in movementsStore.accounts" :key="account.id" :value="account.id">
          {{ account.name }}
        </option>
      </select>
      <select
        v-model="bulk.category"
        aria-label="Cambiar categoría"
        :disabled="!categoryType"
        :class="selectClass"
      >
        <option value="">Categoría</option>
        <option v-for="name in categories" :key="name" :value="name">{{ name }}</option>
      </select>
      <div class="ms-auto flex items-center gap-1">
        <NeonButton danger :disabled="!selected.length" @click="askDelete"> Eliminar </NeonButton>
        <NeonButton variant="primary" :disabled="!selected.length || !hasChange" @click="apply">
          Aplicar
        </NeonButton>
      </div>
    </div>
  </div>
</template>

<style scoped>
.neon-bulk {
  box-shadow: 0 16px 34px -14px oklch(0% 0 none / 0.55);
}

/* On the desktop frame with one column, the bar would reach the report
   launcher fixed at the bottom right: it stops short of it. */
@media (width >= 61.3125rem) {
  @container registry (width < 1040px) {
    .neon-bulk {
      margin-inline-end: 56px;
    }
  }
}
</style>
