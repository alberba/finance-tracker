<script setup lang="ts" generic="Row extends MobileRow">
import { MOBILE_CARD, PRESS, TOTAL_FIGURE } from './table-styles'

// The list of one apartado in the mobile frame (artboard «Configuración ·
// móvil · Pixel 10»): one row per element with its name, a line under it and
// its amount, a bin to remove it and, at the end, the total and the row that
// adds one. A row that can be edited opens it when tapped.
export interface MobileRow {
  id: string
  title: string
  meta: string
  amount?: string
  /** Paints the amount as income. */
  gain?: boolean
  /** Dims a paused row. */
  muted?: boolean
}

defineProps<{
  label: string
  rows: Row[]
  /** «Eliminar Cuenta nómina». */
  deleteLabel: (row: Row) => string
  /** «Editar Cuenta nómina»; without it the rows are not tappable. */
  editLabel?: (row: Row) => string
  addLabel?: string
  total?: { label: string; value: string; hook: string }
}>()
const emit = defineEmits<{ edit: [row: Row]; remove: [row: Row]; add: [] }>()

const ROW = 'border-line flex min-h-16 min-w-0 items-center gap-3 border-t py-2.5'
</script>

<template>
  <section :aria-label="label" :class="MOBILE_CARD">
    <ul class="grid min-w-0">
      <li v-for="row in rows" :key="row.id" :class="ROW" :data-settings-row="row.id">
        <component
          :is="editLabel ? 'button' : 'span'"
          :type="editLabel ? 'button' : undefined"
          :aria-label="editLabel?.(row)"
          class="rounded-field flex min-h-11 min-w-0 flex-1 items-center gap-3 text-start"
          :class="editLabel ? PRESS : ''"
          @click="editLabel && emit('edit', row)"
        >
          <span class="grid min-w-0 flex-1 gap-0.5" :class="row.muted ? 'opacity-60' : ''">
            <span class="text-row truncate font-bold">{{ row.title }}</span>
            <span class="text-muted text-meta truncate">{{ row.meta }}</span>
          </span>
          <span
            v-if="row.amount"
            class="font-display shrink-0 text-[15px] font-semibold whitespace-nowrap tabular-nums"
            :class="row.gain ? 'text-gain' : 'text-text'"
            data-settings-row-amount
          >
            {{ row.amount }}
          </span>
        </component>
        <slot name="trailing" :row="row" />
        <button
          type="button"
          class="bg-panel2 text-muted grid size-11 shrink-0 place-items-center rounded-full"
          :class="PRESS"
          :aria-label="deleteLabel(row)"
          @click="emit('remove', row)"
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
            <path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13" />
          </svg>
        </button>
      </li>
      <li v-if="total" :class="ROW">
        <span class="text-soft min-w-0 flex-1 text-[15px] font-bold">{{ total.label }}</span>
        <span :class="[TOTAL_FIGURE, 'shrink-0']" :data-settings-total="total.hook">
          {{ total.value }}
        </span>
      </li>
      <li v-if="addLabel" class="border-line border-t">
        <button
          type="button"
          class="text-accent-text rounded-field text-row flex min-h-16 w-full items-center gap-3 px-0.5 text-start font-extrabold"
          :class="PRESS"
          @click="emit('add')"
        >
          <svg
            class="size-5"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            aria-hidden="true"
          >
            <path d="M12 5v14M5 12h14" />
          </svg>
          {{ addLabel }}
        </button>
      </li>
    </ul>
  </section>
</template>
