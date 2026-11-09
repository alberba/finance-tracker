<script setup lang="ts">
import { getPathFromSection } from '../../scripts/app/dashboard-section-routing'
import { useEntrySheet } from '../../composables/useEntrySheet'
import type { SectionId } from '../../scripts/types'
import { useRecurringStore } from '../../stores/recurring'
import NeonCard from '../ui/NeonCard.vue'
import NeonEmptyState from '../ui/NeonEmptyState.vue'
import type { NeonDashboardViewModel } from './view-model'

// «Por confirmar»: the due dates of the recurring rules, outside the balances
// until confirmed. Each one is confirmed as it is, or edited in the entry sheet
// and confirmed there; «Confirmar todo» takes them all at once.
defineProps<{ pending: NeonDashboardViewModel['pending'] }>()
const emit = defineEmits<{ confirmAll: []; navigate: [section: SectionId] }>()

const recurringStore = useRecurringStore()
const { openPendingEdit } = useEntrySheet()

function edit(id: string, event: MouseEvent): void {
  const item = recurringStore.openPendingMovements.find((candidate) => candidate.id === id)
  // The row may leave once the sheet confirms it: the focus goes back to the card title.
  const title = (event.currentTarget as HTMLElement)
    .closest('section')
    ?.querySelector<HTMLElement>('h2')
  if (item) openPendingEdit(item, title)
}

const TONE_TEXT = { gain: 'text-gain', loss: 'text-loss', neutral: 'text-text' } as const
const linkButton =
  'outline-accent rounded-pill min-h-11 text-sm font-extrabold underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2'
</script>

<template>
  <NeonCard title="Por confirmar" title-id="dashboard-pending-title" data-dashboard-pending>
    <template #badge>
      <span
        v-if="pending.count"
        class="bg-panel2 text-text rounded-pill grid h-5.5 min-w-5.5 place-items-center px-1.75 text-xs font-extrabold"
      >
        {{ pending.count }}
      </span>
    </template>
    <template #actions>
      <button
        v-if="pending.count > 1"
        type="button"
        class="text-text -me-4 px-4"
        :class="linkButton"
        @click="emit('confirmAll')"
      >
        Confirmar todo
      </button>
    </template>

    <p class="text-muted text-note -mt-1.5">
      Vencimientos de tus reglas recurrentes. No cuentan en los saldos hasta que los confirmes.
    </p>
    <NeonEmptyState v-if="!pending.count">
      Nada por confirmar. Los próximos vencimientos aparecerán aquí el día que toquen.
    </NeonEmptyState>
    <ul v-else>
      <li
        v-for="item in pending.items"
        :key="item.id"
        class="border-line flex min-h-16 flex-col gap-0.5 border-t pbs-2.5"
        :data-dashboard-pending-item="item.id"
      >
        <div class="flex items-baseline justify-between gap-3">
          <span class="text-row font-bold">{{ item.description }}</span>
          <span
            class="font-display text-figure-row font-semibold whitespace-nowrap tabular-nums"
            :class="TONE_TEXT[item.tone]"
          >
            {{ item.amount }}
          </span>
        </div>
        <div class="flex items-center justify-between gap-1">
          <span class="text-muted text-meta min-w-0 flex-1">{{ item.due }}</span>
          <button
            type="button"
            class="text-soft px-3"
            :class="linkButton"
            :aria-label="`Editar ${item.description} antes de confirmar`"
            @click="edit(item.id, $event)"
          >
            Editar
          </button>
          <button
            type="button"
            class="text-text -me-3 px-3"
            :class="linkButton"
            :aria-label="`Confirmar ${item.description}`"
            @click="recurringStore.confirmPending(item.id)"
          >
            Confirmar
          </button>
        </div>
      </li>
    </ul>
    <a
      v-if="pending.moreLabel"
      :href="getPathFromSection('transactions')"
      class="text-text outline-accent inline-flex min-h-11 items-center self-start text-sm font-extrabold underline underline-offset-4 focus-visible:outline-2"
      @click.prevent="emit('navigate', 'transactions')"
    >
      {{ pending.moreLabel }}
    </a>
  </NeonCard>
</template>
