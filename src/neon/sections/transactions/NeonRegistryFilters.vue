<script setup lang="ts">
import { computed, ref, useId } from 'vue'

import { useMovementsStore } from '../../../stores/movements'
import { useUiStore } from '../../../stores/ui'
import NeonButton from '../../ui/NeonButton.vue'
import {
  chosenType,
  moreFiltersLabel,
  TYPE_CHIPS,
  toggleTypeChip,
  type ExtraFilters,
} from './registry-view-model'

// «Buscar y filtrar» of the registry: the search pill, the type segment (one
// type at a time) and «Más filtros» (account, exact day and amount range).
// Search, type and account are the registry's shared filters; the day and the
// amounts only exist in the new design and come in as `extra`. The registry's
// own actions (select, export) go at the end of the row.
const extra = defineModel<ExtraFilters>('extra', { required: true })
const emit = defineEmits<{ clear: [] }>()

const movementsStore = useMovementsStore()
const filters = useUiStore().ui.txFilters

const moreOpen = ref(false)
const moreId = useId()
const type = computed(() => chosenType(filters.types))
const moreLabel = computed(() => moreFiltersLabel(filters.accountIds, extra.value))
const accountChips = computed(() => [
  { value: '', label: 'Todas' },
  ...movementsStore.accounts.map((account) => ({ value: account.id, label: account.name })),
])
const account = computed(() => filters.accountIds[0] ?? '')

function setAccount(value: string): void {
  filters.accountIds = value ? [value] : []
}

function setExtra(key: keyof ExtraFilters, value: string): void {
  extra.value = { ...extra.value, [key]: value }
}

const chipClass =
  'outline-accent rounded-pill min-h-[38px] border px-3.5 text-[13px] font-extrabold focus-visible:outline-2 focus-visible:outline-offset-2'
const fieldClass =
  'bg-panel border-ctrl-line text-text outline-accent rounded-field min-h-[46px] border px-3.5 text-[16px] font-bold focus-visible:outline-2 focus-visible:outline-offset-2'
</script>

<template>
  <section aria-label="Buscar y filtrar" class="grid min-w-0 gap-3" data-registry-filters>
    <div class="flex flex-wrap items-center gap-2.5">
      <label
        class="border-ctrl-line text-muted rounded-pill focus-within:outline-accent flex min-h-[46px] min-w-0 flex-[1_1_min(260px,100%)] items-center gap-2.5 border px-[18px] focus-within:outline-2 focus-within:outline-offset-2"
      >
        <svg
          class="size-[18px] shrink-0"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          aria-hidden="true"
        >
          <path d="M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM20 20l-4-4" />
        </svg>
        <span class="sr-only">Buscar movimientos</span>
        <input
          v-model="filters.search"
          type="search"
          name="txSearch"
          placeholder="Descripción o categoría"
          class="text-text placeholder:text-faint w-full min-w-0 flex-1 bg-transparent text-[16px] font-bold outline-none"
        />
      </label>
      <div
        class="bg-panel2 rounded-pill flex max-w-full [scrollbar-width:none] gap-[3px] overflow-x-auto p-[3px]"
        role="group"
        aria-label="Filtrar por tipo"
      >
        <button
          v-for="chip in TYPE_CHIPS"
          :key="chip.value"
          type="button"
          :aria-pressed="type === chip.value"
          :data-type-chip="chip.value"
          class="outline-accent rounded-pill inline-flex min-h-[38px] shrink-0 items-center gap-2 px-3.5 text-[14px] font-extrabold whitespace-nowrap focus-visible:outline-2 focus-visible:-outline-offset-2"
          :class="type === chip.value ? 'bg-sel-bg text-sel-text' : 'text-soft'"
          @click="filters.types = toggleTypeChip(filters.types, chip.value)"
        >
          <span
            class="size-2 shrink-0 rounded-full"
            :class="{
              'bg-text': chip.value === 'expense',
              'bg-gain': chip.value === 'income',
              'bg-peach': chip.value === 'saving',
              'bg-lilac': chip.value === 'investment',
            }"
            aria-hidden="true"
          ></span>
          {{ chip.label }}
        </button>
      </div>
      <NeonButton
        :aria-expanded="moreOpen"
        :aria-controls="moreId"
        class="shrink-0"
        @click="moreOpen = !moreOpen"
      >
        {{ moreLabel }}
      </NeonButton>
      <div class="ms-auto flex shrink-0 items-center gap-1">
        <slot name="actions" />
      </div>
    </div>

    <div
      v-if="moreOpen"
      :id="moreId"
      class="bg-panel border-line rounded-card motion-safe:animate-fade-in grid gap-3.5 border px-6 py-[22px]"
    >
      <div class="flex flex-wrap gap-2" role="group" aria-label="Cuenta">
        <button
          v-for="chip in accountChips"
          :key="chip.value"
          type="button"
          :aria-pressed="account === chip.value"
          :class="[
            chipClass,
            account === chip.value
              ? 'bg-sel-bg border-sel-border text-sel-text'
              : 'border-ctrl-line text-soft',
          ]"
          @click="setAccount(chip.value)"
        >
          {{ chip.label }}
        </button>
      </div>
      <div class="flex flex-wrap items-end gap-3">
        <label class="text-muted grid gap-1.5 text-[13px] font-bold">
          Fecha exacta
          <input
            type="date"
            name="txDay"
            :value="extra.date"
            :class="fieldClass"
            @input="setExtra('date', ($event.target as HTMLInputElement).value)"
          />
        </label>
        <label class="text-muted grid gap-1.5 text-[13px] font-bold">
          Importe mín.
          <input
            inputmode="decimal"
            name="txMin"
            placeholder="0,00"
            :value="extra.min"
            :class="[fieldClass, 'w-[130px]']"
            @input="setExtra('min', ($event.target as HTMLInputElement).value)"
          />
        </label>
        <label class="text-muted grid gap-1.5 text-[13px] font-bold">
          Importe máx.
          <input
            inputmode="decimal"
            name="txMax"
            placeholder="0,00"
            :value="extra.max"
            :class="[fieldClass, 'w-[130px]']"
            @input="setExtra('max', ($event.target as HTMLInputElement).value)"
          />
        </label>
        <NeonButton @click="emit('clear')">Limpiar filtros</NeonButton>
      </div>
    </div>
  </section>
</template>
