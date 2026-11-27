<script setup lang="ts">
import { computed } from 'vue'

import { formatDayMonth } from '../../../lib/format'
import { useFinancialStateStore } from '../../../stores/financial-state'
import NeonButton from '../../ui/NeonButton.vue'
import NeonFilterChip from './NeonFilterChip.vue'
import { useRegistryFilters } from './registry-filters'
import { amountFilterLabel, hasExtraFilters, type ExtraFilters } from './registry-view-model'

// «Buscar y filtrar» of the registry: the search pill and one chip per filter
// (Tipo, Cuenta, Fecha, Importe), each saying its value and opening its own
// panel, so what narrows the list shows without opening anything. Search, type
// and account are the registry's shared filters; the day and the amounts only
// exist in the new design and come in as `extra`. The registry's own actions
// (select, export) go at the end of the row. `compact` is the phone: the search
// shares its row with the actions (a «⋯» menu) and the chips slide sideways
// under it, each opening its panel as a bottom sheet.
const props = withDefaults(defineProps<{ compact?: boolean }>(), { compact: false })
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
  clearExtra: clearKeys,
} = useRegistryFilters(extra)
const currency = computed(() => financialStateStore.currency || 'EUR')

const dateLabel = computed(() =>
  extra.value.date ? formatDayMonth(extra.value.date) : 'Cualquiera',
)
const amountLabel = computed(() => amountFilterLabel(extra.value, currency.value))
const amountActive = computed(() => Boolean(extra.value.min.trim() || extra.value.max.trim()))

const anyFilter = computed(() =>
  Boolean(filters.search.trim() || type.value || account.value || hasExtraFilters(extra.value)),
)

function clearExtra(keys: Array<keyof ExtraFilters>, close: (returnFocus?: boolean) => void): void {
  close(true)
  clearKeys(keys)
}

const fieldClass =
  'bg-panel border-ctrl-line text-text outline-accent rounded-field min-h-[46px] border px-3.5 text-[16px] font-bold focus-visible:outline-2 focus-visible:outline-offset-2'
</script>

<template>
  <section
    aria-label="Buscar y filtrar"
    class="min-w-0 items-center gap-2.5"
    :class="props.compact ? 'grid grid-cols-[minmax(0,1fr)_auto]' : 'flex flex-wrap'"
    data-registry-filters
  >
    <label
      class="border-ctrl-line text-muted rounded-pill focus-within:outline-accent flex min-h-[46px] min-w-0 items-center gap-2.5 border px-[18px] focus-within:outline-2 focus-within:outline-offset-2"
      :class="!props.compact && 'flex-[1_1_100%] @min-[720px]/registry:flex-[0_1_340px]'"
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
        class="text-text placeholder:text-faint w-full min-w-0 flex-1 self-stretch bg-transparent text-[16px] font-bold outline-none"
      />
    </label>

    <div v-if="props.compact && $slots.actions" class="flex items-center">
      <slot name="actions" />
    </div>

    <div
      class="min-w-0 gap-2"
      :class="
        props.compact
          ? 'col-span-full -mx-4 flex [scrollbar-width:none] overflow-x-auto px-4 [&::-webkit-scrollbar]:hidden [&>*]:flex-none'
          : 'grid flex-[1_1_100%] grid-cols-2 @min-[720px]/registry:flex @min-[720px]/registry:flex-none @min-[720px]/registry:flex-wrap'
      "
    >
      <NeonFilterChip
        :sheet="props.compact"
        name="Tipo"
        :value="typeLabel"
        :active="Boolean(type)"
        panel-label="Tipo de movimiento"
        :options="typeOptions"
        :selected="type"
        @select="setType"
      />
      <NeonFilterChip
        :sheet="props.compact"
        name="Cuenta"
        end-when-narrow
        :value="accountLabel"
        :active="Boolean(account)"
        panel-label="Cuenta"
        :options="accountOptions"
        :selected="account"
        @select="setAccount"
      />
      <NeonFilterChip
        v-slot="{ close }"
        :sheet="props.compact"
        name="Fecha"
        :value="dateLabel"
        :active="Boolean(extra.date)"
        panel-label="Fecha exacta"
      >
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
        <div class="flex justify-end">
          <NeonButton :disabled="!extra.date" @click="clearExtra(['date'], close)">
            Quitar fecha
          </NeonButton>
        </div>
      </NeonFilterChip>
      <NeonFilterChip
        v-slot="{ close }"
        :sheet="props.compact"
        name="Importe"
        end-when-narrow
        :value="amountLabel"
        :active="amountActive"
        panel-label="Importe"
      >
        <div class="flex gap-3">
          <label class="text-muted grid gap-1.5 text-[13px] font-bold">
            Mínimo
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
            Máximo
            <input
              inputmode="decimal"
              name="txMax"
              placeholder="0,00"
              :value="extra.max"
              :class="[fieldClass, 'w-[130px]']"
              @input="setExtra('max', ($event.target as HTMLInputElement).value)"
            />
          </label>
        </div>
        <div class="flex justify-end">
          <NeonButton :disabled="!amountActive" @click="clearExtra(['min', 'max'], close)">
            Quitar importe
          </NeonButton>
        </div>
      </NeonFilterChip>
      <NeonFilterChip
        v-if="extra.category"
        v-slot="{ close }"
        :sheet="props.compact"
        name="Categoría"
        :value="extra.category"
        active
        panel-label="Categoría"
      >
        <p class="text-soft max-w-[260px] text-[14px]">
          Elegida en el resumen del mes. Pulsa otra categoría allí para cambiarla.
        </p>
        <div class="flex justify-end">
          <NeonButton @click="clearExtra(['category'], close)">Quitar categoría</NeonButton>
        </div>
      </NeonFilterChip>
      <NeonButton v-if="props.compact && anyFilter" @click="emit('clear')">Limpiar</NeonButton>
    </div>

    <NeonButton v-if="!props.compact && anyFilter" @click="emit('clear')">Limpiar</NeonButton>

    <div v-if="!props.compact && $slots.actions" class="ms-auto flex shrink-0 items-center gap-1">
      <slot name="actions" />
    </div>
  </section>
</template>
