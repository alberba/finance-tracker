<script setup lang="ts">
import { computed } from 'vue'

import { useMovementsStore } from '../../../stores/movements'
import { useUiStore } from '../../../stores/ui'
import type { ExtraFilters } from './registry-view-model'

// The fields behind «Más filtros»: the account (one of the registry's shared
// filters) and the exact day and amount range (`extra`, this design's own).
// The registry places them: inline under the filter row on the desktop frame,
// in a bottom sheet on the mobile one.
const extra = defineModel<ExtraFilters>('extra', { required: true })

const movementsStore = useMovementsStore()
const filters = useUiStore().ui.txFilters

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
  'outline-accent rounded-pill min-h-[38px] pointer-coarse:min-h-11 border px-3.5 text-[13px] font-extrabold focus-visible:outline-2 focus-visible:outline-offset-2'
const fieldClass =
  'bg-panel border-ctrl-line text-text outline-accent rounded-field min-h-[46px] w-full min-w-0 border px-3.5 text-[16px] font-bold focus-visible:outline-2 focus-visible:outline-offset-2'
const labelClass = 'text-muted grid min-w-0 gap-1.5 text-[13px] font-bold'
</script>

<template>
  <div class="@container grid gap-3.5">
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
    <div
      class="grid grid-cols-[repeat(auto-fill,minmax(130px,1fr))] items-end gap-3 @min-[560px]:grid-cols-[auto_130px_130px_auto] @min-[560px]:justify-start"
    >
      <label :class="[labelClass, 'col-span-full @min-[560px]:col-auto']">
        Fecha exacta
        <input
          type="date"
          name="txDay"
          :value="extra.date"
          :class="fieldClass"
          @input="setExtra('date', ($event.target as HTMLInputElement).value)"
        />
      </label>
      <label :class="labelClass">
        Importe mín.
        <input
          inputmode="decimal"
          name="txMin"
          placeholder="0,00"
          :value="extra.min"
          :class="fieldClass"
          @input="setExtra('min', ($event.target as HTMLInputElement).value)"
        />
      </label>
      <label :class="labelClass">
        Importe máx.
        <input
          inputmode="decimal"
          name="txMax"
          placeholder="0,00"
          :value="extra.max"
          :class="fieldClass"
          @input="setExtra('max', ($event.target as HTMLInputElement).value)"
        />
      </label>
      <slot />
    </div>
  </div>
</template>
