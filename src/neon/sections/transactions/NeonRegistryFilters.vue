<script setup lang="ts">
import { computed, ref, useId } from 'vue'

import { useMediaQuery } from '../../../composables/useMediaQuery'
import { useUiStore } from '../../../stores/ui'
import NeonButton from '../../ui/NeonButton.vue'
import NeonDetailPanel from '../../ui/NeonDetailPanel.vue'
import { FRAME_QUERY } from '../../ui/sheet-drag'
import NeonRegistryMoreFilters from './NeonRegistryMoreFilters.vue'
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
//
// On the desktop frame «Más filtros» unfolds under the row; on the mobile one
// it opens a bottom sheet (DESIGN.md, Layout: sheets for detail and forms),
// where the filters apply as they change and «Ver movimientos» closes it.
const extra = defineModel<ExtraFilters>('extra', { required: true })
const emit = defineEmits<{ clear: [] }>()

const filters = useUiStore().ui.txFilters
const desktopFrame = useMediaQuery(FRAME_QUERY)

const moreOpen = ref(false)
const moreId = useId()
const type = computed(() => chosenType(filters.types))
const moreLabel = computed(() => moreFiltersLabel(filters.accountIds, extra.value))
</script>

<template>
  <section
    aria-label="Buscar y filtrar"
    class="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-3"
    data-registry-filters
  >
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
          class="text-text placeholder:text-faint w-full min-w-0 flex-1 self-stretch bg-transparent text-[16px] font-bold outline-none"
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
          class="outline-accent rounded-pill inline-flex min-h-[38px] shrink-0 items-center gap-2 px-3.5 text-[14px] font-extrabold whitespace-nowrap focus-visible:outline-2 focus-visible:-outline-offset-2 pointer-coarse:min-h-11"
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
      <div class="flex min-w-0 flex-[1_1_auto] flex-wrap items-center gap-x-1 gap-y-2">
        <NeonButton
          :aria-expanded="moreOpen"
          :aria-controls="desktopFrame ? moreId : undefined"
          :aria-haspopup="desktopFrame ? undefined : 'dialog'"
          class="shrink-0"
          @click="moreOpen = !moreOpen"
        >
          {{ moreLabel }}
        </NeonButton>
        <div class="ms-auto flex shrink-0 items-center gap-1">
          <slot name="actions" />
        </div>
      </div>
    </div>

    <div
      v-if="desktopFrame && moreOpen"
      :id="moreId"
      class="bg-panel border-line rounded-card motion-safe:animate-fade-in border px-6 py-[22px]"
    >
      <NeonRegistryMoreFilters v-model:extra="extra">
        <NeonButton class="justify-self-start" @click="emit('clear')">Limpiar filtros</NeonButton>
      </NeonRegistryMoreFilters>
    </div>
    <NeonDetailPanel v-if="!desktopFrame" v-model:open="moreOpen" title="Más filtros">
      <NeonRegistryMoreFilters v-model:extra="extra" />
      <template #footer>
        <NeonButton class="me-auto" @click="emit('clear')">Limpiar filtros</NeonButton>
        <NeonButton variant="primary" @click="moreOpen = false">Ver movimientos</NeonButton>
      </template>
    </NeonDetailPanel>
  </section>
</template>
