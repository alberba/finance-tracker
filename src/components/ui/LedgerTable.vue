<script setup lang="ts" generic="Row">
import { computed, useSlots } from 'vue'

export interface LedgerColumn<R = unknown> {
  key: string
  label: string
  align?: 'left' | 'right'
  /** Hides the column below this breakpoint instead of scrolling sideways. */
  hideBelow?: 'sm' | 'md' | 'lg'
  /** Renders the cell as the row header (`th scope="row"`). */
  rowHeader?: boolean
  /** Plain cell text; a `cell-<key>` slot overrides it. */
  value?: (row: R) => string
}

// The ledger table: small-caps header, hairline rules, figures to the right.
// Rows can expand (click anywhere on the row, or its toggle button from the
// keyboard) to show a detail slot; a `total-<key>` slot adds a total row.
const props = defineProps<{
  columns: LedgerColumn<Row>[]
  rows: Row[]
  rowKey: (row: Row) => string
  label: string
  emptyText?: string
  /** Makes rows expandable; names the toggle for the row and state. */
  expandLabel?: (row: Row, open: boolean) => string
  /** Extra attributes per row (`data-*` hooks for tests and scripts). */
  rowAttrs?: (row: Row) => Record<string, string>
}>()

const expanded = defineModel<string | null>('expanded', { default: null })
const slots = useSlots()

const HIDE: Record<NonNullable<LedgerColumn['hideBelow']>, string> = {
  sm: 'hidden sm:table-cell',
  md: 'hidden md:table-cell',
  lg: 'hidden lg:table-cell',
}

function cellClass(column: LedgerColumn<Row>): string[] {
  return [
    column.align === 'right' ? 'text-right' : 'text-left',
    column.hideBelow ? HIDE[column.hideBelow] : '',
  ]
}

const expandable = computed(() => Boolean(props.expandLabel))
const hasTotal = computed(() => props.columns.some((column) => slots[`total-${column.key}`]))
const span = computed(() => props.columns.length + (expandable.value ? 1 : 0))

function toggle(row: Row): void {
  if (!expandable.value) return
  const key = props.rowKey(row)
  expanded.value = expanded.value === key ? null : key
}
</script>

<template>
  <p
    v-if="!rows.length"
    class="border-line text-text-muted rounded-md border border-dashed p-4 text-sm"
    data-ledger-empty
  >
    <slot name="empty">{{ emptyText }}</slot>
  </p>
  <div v-else class="overflow-x-auto">
    <table class="w-full border-collapse text-sm sm:text-base" :aria-label="label">
      <thead>
        <tr>
          <th
            v-for="column in columns"
            :key="column.key"
            scope="col"
            class="text-text-muted px-2 pb-3 text-xs font-semibold tracking-[0.08em] whitespace-nowrap uppercase"
            :class="cellClass(column)"
          >
            {{ column.label }}
          </th>
          <th v-if="expandable" scope="col" class="w-11 pb-3">
            <span class="sr-only">Detalle</span>
          </th>
        </tr>
      </thead>
      <tbody>
        <template v-for="row in rows" :key="rowKey(row)">
          <tr
            class="border-line border-t transition-colors"
            :class="[
              expandable ? 'hover:bg-subtle cursor-pointer' : 'hover:bg-subtle/60',
              expanded === rowKey(row) ? 'bg-subtle' : '',
            ]"
            v-bind="rowAttrs?.(row)"
            @click="toggle(row)"
          >
            <component
              :is="column.rowHeader ? 'th' : 'td'"
              v-for="column in columns"
              :key="column.key"
              :scope="column.rowHeader ? 'row' : undefined"
              class="h-14 px-2 py-2 font-normal"
              :class="cellClass(column)"
            >
              <slot :name="`cell-${column.key}`" :row="row">{{ column.value?.(row) }}</slot>
            </component>
            <td v-if="expandable" class="w-11 py-1 text-right">
              <button
                type="button"
                class="text-text-muted hover:bg-line hover:text-text-main focus-visible:outline-primary inline-flex size-11 items-center justify-center rounded-md focus-visible:outline-2"
                :aria-expanded="expanded === rowKey(row)"
                :aria-label="expandLabel!(row, expanded === rowKey(row))"
                @click.stop="toggle(row)"
              >
                <svg
                  class="size-4.5 transition-transform"
                  :class="{ 'rotate-180': expanded === rowKey(row) }"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  aria-hidden="true"
                >
                  <path d="M6 9l6 6 6-6" />
                </svg>
              </button>
            </td>
          </tr>
          <tr v-if="expandable && expanded === rowKey(row)" class="bg-subtle" data-ledger-detail>
            <td :colspan="span" class="px-2 pb-6 sm:px-5">
              <slot name="detail" :row="row" />
            </td>
          </tr>
        </template>
      </tbody>
      <tfoot v-if="hasTotal">
        <tr class="border-text-main border-t-2" data-ledger-total>
          <td
            v-for="column in columns"
            :key="column.key"
            class="h-14 px-2 py-2"
            :class="cellClass(column)"
          >
            <slot :name="`total-${column.key}`" />
          </td>
          <td v-if="expandable"></td>
        </tr>
      </tfoot>
    </table>
  </div>
</template>
