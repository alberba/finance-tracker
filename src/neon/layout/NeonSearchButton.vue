<script setup lang="ts">
import { ref, shallowRef, useTemplateRef } from 'vue'

import { useSectionNavigation } from '../../composables/useSectionNavigation'
import { useUiStore } from '../../stores/ui'
import NeonButton from '../ui/NeonButton.vue'
import NeonDetailPanel from '../ui/NeonDetailPanel.vue'

// «Buscar» in the top bar of the mobile frame (DESIGN.md, «Barra superior
// móvil»): a sheet with the search field; searching opens Movimientos already
// filtered, as the search of the desktop dashboard header does.
const uiStore = useUiStore()
const { navigateTo } = useSectionNavigation()
const triggerButton = useTemplateRef<HTMLButtonElement>('triggerButton')
const open = ref(false)
const query = shallowRef('')

function search(): void {
  const text = query.value.trim()
  if (!text) return
  uiStore.ui.txFilters.search = text
  open.value = false
  query.value = ''
  navigateTo('transactions')
}
</script>

<template>
  <button
    ref="triggerButton"
    type="button"
    class="text-soft outline-accent grid size-12 place-items-center rounded-full focus-visible:outline-2 focus-visible:outline-offset-2 motion-safe:transition-transform motion-safe:duration-160 motion-safe:ease-out motion-safe:active:scale-[0.97]"
    aria-label="Buscar movimientos"
    aria-haspopup="dialog"
    :aria-expanded="open"
    @click="open = true"
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
      <path d="M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM20 20l-4-4" />
    </svg>
  </button>

  <NeonDetailPanel v-model:open="open" title="Buscar movimientos" :return-focus="triggerButton">
    <form role="search" class="grid gap-3.5" @submit.prevent="search">
      <label
        class="border-ctrl-line text-muted rounded-pill focus-within:outline-accent flex min-h-11.5 items-center gap-2.5 border px-4.5 focus-within:outline-2 focus-within:outline-offset-2"
      >
        <svg
          class="size-4.5 shrink-0"
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
        <!-- The sheet opens to type: the field takes the focus, not the close button. -->
        <input
          v-model="query"
          type="search"
          enterkeyhint="search"
          autofocus
          placeholder="Busca un movimiento…"
          class="text-text placeholder:text-muted min-w-0 flex-1 self-stretch bg-transparent text-base font-bold outline-none"
        />
      </label>
      <NeonButton variant="primary" type="submit">Buscar</NeonButton>
    </form>
  </NeonDetailPanel>
</template>
