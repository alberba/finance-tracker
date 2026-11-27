<script setup lang="ts">
import { computed, ref, useTemplateRef } from 'vue'

import { formatDayMonth } from '../../../lib/format'
import { useFinancialStateStore } from '../../../stores/financial-state'
import NeonButton from '../../ui/NeonButton.vue'
import NeonDetailPanel from '../../ui/NeonDetailPanel.vue'
import { useBarActionsSlot } from '../../ui/bar-title-slot'
import { swapLedger } from './ledger-swap'
import { useRegistryFilters } from './registry-filters'
import { amountFilterLabel, type ExtraFilters } from './registry-view-model'

// The registry's filters on the phone (DESIGN.md, «Movimientos en móvil»): one
// button in the top bar, between «Por confirmar» and search, opens every
// filter in one sheet (type, account, day, amount); what is on shows under the
// month line as chips that take it off. The search is the top bar's own.
// `inBar` puts the button in the bar while the registry is the page in sight.
const props = defineProps<{ inBar: boolean; shownCount: number }>()
const extra = defineModel<ExtraFilters>('extra', { required: true })
const emit = defineEmits<{ clear: [] }>()

const financialStateStore = useFinancialStateStore()
const {
  filters,
  typeOptions,
  type,
  typeLabel,
  accountOptions,
  account,
  accountLabel,
  setType,
  setAccount,
  setExtra,
  clearExtra,
} = useRegistryFilters(extra)
const currency = computed(() => financialStateStore.currency || 'EUR')
const barSlot = useBarActionsSlot()
const trigger = useTemplateRef<HTMLButtonElement>('trigger')
const open = ref(false)

const amountActive = computed(() => Boolean(extra.value.min.trim() || extra.value.max.trim()))

interface ActiveFilter {
  key: string
  label: string
  clear: () => void
}

const active = computed<ActiveFilter[]>(() => {
  const list: ActiveFilter[] = []
  const search = filters.search.trim()
  if (search)
    list.push({
      key: 'search',
      label: `«${search}»`,
      clear: () => swapLedger(() => (filters.search = '')),
    })
  if (type.value) list.push({ key: 'type', label: typeLabel.value, clear: () => setType('') })
  if (account.value)
    list.push({ key: 'account', label: accountLabel.value, clear: () => setAccount('') })
  if (extra.value.date)
    list.push({
      key: 'date',
      label: formatDayMonth(extra.value.date),
      clear: () => clearExtra(['date']),
    })
  if (amountActive.value)
    list.push({
      key: 'amount',
      label: amountFilterLabel(extra.value, currency.value),
      clear: () => clearExtra(['min', 'max']),
    })
  if (extra.value.category)
    list.push({
      key: 'category',
      label: extra.value.category,
      clear: () => clearExtra(['category']),
    })
  return list
})
// The search is not set in the sheet, so the button's count leaves it out.
const sheetCount = computed(() => active.value.filter((item) => item.key !== 'search').length)

const chipClass =
  'border-ctrl-line text-soft outline-accent rounded-pill inline-flex min-h-[38px] items-center gap-1.5 border px-3.5 text-[13px] font-extrabold focus-visible:outline-2 focus-visible:outline-offset-2 aria-pressed:border-sel-border aria-pressed:bg-sel-bg aria-pressed:text-sel-text motion-safe:transition-transform motion-safe:duration-160 motion-safe:ease-out motion-safe:active:scale-[0.97]'
const fieldClass =
  'bg-panel border-ctrl-line text-text outline-accent rounded-field min-h-[46px] w-full min-w-0 border px-3.5 text-[16px] font-bold focus-visible:outline-2 focus-visible:outline-offset-2'
const labelClass = 'text-muted text-label tracking-label font-extrabold uppercase'
</script>

<template>
  <Teleport v-if="barSlot && props.inBar" :to="barSlot">
    <button
      ref="trigger"
      type="button"
      class="text-soft outline-accent relative grid size-12 place-items-center rounded-full focus-visible:outline-2 focus-visible:outline-offset-2 motion-safe:transition-transform motion-safe:duration-160 motion-safe:ease-out motion-safe:active:scale-[0.97]"
      :aria-label="sheetCount ? `Filtros, ${sheetCount} activos` : 'Filtros'"
      aria-haspopup="dialog"
      :aria-expanded="open"
      data-registry-filter-button
      @click="open = true"
    >
      <svg
        class="size-6"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        aria-hidden="true"
      >
        <path d="M4 6h16M7 12h10M10 18h4" />
      </svg>
      <span
        v-if="sheetCount"
        class="bg-accent text-on-accent rounded-pill absolute inset-e-1.5 inset-bs-1.5 grid h-[18px] min-w-[18px] place-items-center px-1 text-[11px] font-extrabold"
        aria-hidden="true"
        >{{ sheetCount }}</span
      >
    </button>
  </Teleport>

  <div v-if="active.length" class="flex flex-wrap gap-2" aria-label="Filtros activos" role="group">
    <button
      v-for="item in active"
      :key="item.key"
      type="button"
      :class="chipClass"
      aria-pressed="true"
      :aria-label="`Quitar filtro: ${item.label}`"
      @click="item.clear()"
    >
      <span class="max-w-[16rem] truncate">{{ item.label }}</span>
      <svg
        class="size-3.5 shrink-0"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2.5"
        stroke-linecap="round"
        aria-hidden="true"
      >
        <path d="M18 6 6 18M6 6l12 12" />
      </svg>
    </button>
    <NeonButton v-if="active.length > 1" @click="emit('clear')">Limpiar</NeonButton>
  </div>

  <NeonDetailPanel v-model:open="open" title="Filtros" :return-focus="trigger">
    <div class="grid gap-5">
      <fieldset class="grid gap-2.5">
        <legend :class="[labelClass, 'mbe-2.5']">Tipo</legend>
        <div class="flex flex-wrap gap-2">
          <button
            v-for="option in typeOptions"
            :key="option.value"
            type="button"
            :class="chipClass"
            :aria-pressed="type === option.value"
            @click="setType(option.value)"
          >
            {{ option.label }}
          </button>
        </div>
      </fieldset>
      <fieldset class="grid gap-2.5">
        <legend :class="[labelClass, 'mbe-2.5']">Cuenta</legend>
        <div class="flex flex-wrap gap-2">
          <button
            v-for="option in accountOptions"
            :key="option.value"
            type="button"
            :class="chipClass"
            :aria-pressed="account === option.value"
            @click="setAccount(option.value)"
          >
            {{ option.label }}
          </button>
        </div>
      </fieldset>
      <label class="grid gap-2.5">
        <span :class="labelClass">Fecha exacta</span>
        <input
          type="date"
          name="txDay"
          :value="extra.date"
          :class="fieldClass"
          @input="setExtra('date', ($event.target as HTMLInputElement).value)"
        />
      </label>
      <fieldset class="grid gap-2.5">
        <legend :class="[labelClass, 'mbe-2.5']">Importe</legend>
        <div class="grid grid-cols-2 gap-3">
          <label class="text-muted grid gap-1.5 text-[13px] font-bold">
            Mínimo
            <input
              inputmode="decimal"
              name="txMin"
              placeholder="0,00"
              :value="extra.min"
              :class="fieldClass"
              @input="setExtra('min', ($event.target as HTMLInputElement).value)"
            />
          </label>
          <label class="text-muted grid gap-1.5 text-[13px] font-bold">
            Máximo
            <input
              inputmode="decimal"
              name="txMax"
              placeholder="0,00"
              :value="extra.max"
              :class="fieldClass"
              @input="setExtra('max', ($event.target as HTMLInputElement).value)"
            />
          </label>
        </div>
      </fieldset>
    </div>
    <template #footer>
      <NeonButton v-if="sheetCount" @click="emit('clear')">Limpiar</NeonButton>
      <NeonButton variant="primary" @click="open = false">
        Ver {{ shownCount }} {{ shownCount === 1 ? 'movimiento' : 'movimientos' }}
      </NeonButton>
    </template>
  </NeonDetailPanel>
</template>
