<script setup lang="ts">
import { computed, ref } from 'vue'

import { getPathFromSection } from '../../scripts/app/dashboard-section-routing'
import { useEntrySheet } from '../../composables/useEntrySheet'
import type { SectionId } from '../../scripts/types'
import { useRecurringStore } from '../../stores/recurring'
import NeonCard from '../ui/NeonCard.vue'
import NeonEmptyState from '../ui/NeonEmptyState.vue'
import NeonFitList from '../ui/NeonFitList.vue'
import { rowDelay, rowEnter, rowLeave } from '../ui/row-motion'
import type { NeonDashboardViewModel } from './view-model'

// «Por confirmar»: the due dates of the recurring rules, outside the balances
// until confirmed. Each one is confirmed as it is, or edited in the entry sheet
// and confirmed there; «Confirmar todo» takes them all at once.
const props = defineProps<{ pending: NeonDashboardViewModel['pending'] }>()
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

// Confirming one marks it as done for a moment before it folds away, so the
// row reads as moved to Movimientos rather than gone. The focus goes back to
// the card title, as the row it was on is leaving.
const CONFIRM_HOLD = 450
const confirming = ref<ReadonlySet<string>>(new Set())

function confirm(id: string, event: MouseEvent): void {
  if (confirming.value.has(id)) return
  const title = (event.currentTarget as HTMLElement)
    .closest('section')
    ?.querySelector<HTMLElement>('h2')
  // The pressed button is about to be replaced: the focus waits on the title.
  title?.setAttribute('tabindex', '-1')
  title?.focus({ preventScroll: true })
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
    recurringStore.confirmPending(id)
    return
  }
  confirming.value = new Set([...confirming.value, id])
  setTimeout(() => {
    recurringStore.confirmPending(id)
    confirming.value = new Set([...confirming.value].filter((other) => other !== id))
  }, CONFIRM_HOLD)
}

// How many rows the box shows: when it cannot show them all, the link to the
// full list appears (the card does not scroll).
const fitted = ref(Infinity)
const moreLabel = computed(
  () =>
    props.pending.moreLabel ??
    (fitted.value < props.pending.items.length
      ? `Ver los ${props.pending.count} pendientes`
      : null),
)

const TONE_TEXT = { gain: 'text-gain', loss: 'text-loss', neutral: 'text-text' } as const
const linkButton =
  'outline-accent rounded-pill min-h-11 text-sm font-extrabold underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2 motion-safe:transition-transform motion-safe:duration-160 motion-safe:ease-out motion-safe:active:scale-[0.96]'
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

    <p v-if="pending.count" class="text-muted text-note -mt-1.5 text-pretty">
      Vencimientos de tus reglas recurrentes. No cuentan en los saldos hasta que los confirmes.
    </p>
    <div v-if="!pending.count" class="grid flex-1">
      <NeonEmptyState
        class="content-center justify-items-center! border-transparent! text-center text-pretty"
      >
        Nada por confirmar. Los próximos vencimientos de tus reglas recurrentes aparecerán aquí el
        día que toquen.
      </NeonEmptyState>
    </div>
    <NeonFitList v-else @fitted="fitted = $event">
      <TransitionGroup :css="false" @enter="rowEnter" @leave="rowLeave">
        <li
          v-for="(item, index) in pending.items"
          :key="item.id"
          class="border-line motion-safe:animate-row flex min-h-16 flex-col gap-0.5 border-t pbs-2.5"
          :style="{ animationDelay: `${rowDelay(index)}ms` }"
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
            <span
              v-if="confirming.has(item.id)"
              class="text-gain motion-safe:animate-swap inline-flex min-h-11 items-center gap-1.5 text-sm font-extrabold"
              role="status"
            >
              <svg
                class="size-4"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2.5"
                stroke-linecap="round"
                stroke-linejoin="round"
                aria-hidden="true"
              >
                <path d="M5 12.5l4.5 4.5L19 7.5" />
              </svg>
              Confirmado
            </span>
            <template v-else>
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
                @click="confirm(item.id, $event)"
              >
                Confirmar
              </button>
            </template>
          </div>
        </li>
      </TransitionGroup>
    </NeonFitList>
    <a
      v-if="moreLabel"
      :href="getPathFromSection('transactions')"
      class="text-text outline-accent inline-flex min-h-11 items-center self-start text-sm font-extrabold underline underline-offset-4 focus-visible:outline-2"
      @click.prevent="emit('navigate', 'transactions')"
    >
      {{ moreLabel }}
    </a>
  </NeonCard>
</template>
