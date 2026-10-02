<script setup lang="ts">
import type {
  DashboardRecentTransaction,
  DashboardTransactionTone,
} from '../../domain/dashboard/view-model'

defineProps<{
  transactions: DashboardRecentTransaction[]
}>()

const emit = defineEmits<{
  navigate: [target: string]
}>()

const headClass = 'p-2 text-xs font-bold text-left text-text-faint uppercase'

const columns: { label: string; class?: string }[] = [
  { label: 'Fecha' },
  { label: 'Descripción' },
  { label: 'Categoría' },
  { label: 'Tipo' },
  { label: 'Importe', class: 'text-right' },
]

function toneTextClass(tone: DashboardTransactionTone): string {
  if (tone === 'income') {
    return 'text-(--income)'
  }
  if (tone === 'expense') {
    return 'text-(--expense)'
  }
  return 'text-(--invest)'
}

function transactionBadgeClass(tone: DashboardTransactionTone): string {
  if (tone === 'income') {
    return 'bg-(--income-bg) text-(--income)'
  }
  if (tone === 'expense') {
    return 'bg-(--expense-bg) text-(--expense)'
  }
  return 'bg-(--invest-bg) text-(--invest)'
}
</script>

<template>
  <div class="hidden max-w-full min-w-0 overflow-x-auto md:block">
    <table class="w-full p-2 text-sm [&_tbody_tr:last-child_td]:border-b-0">
      <thead class="text-text-faint bg-(--bg-subtle)">
        <tr class="border-b border-(--line)">
          <th v-for="col in columns" :key="col.label" scope="col" :class="[headClass, col.class]">
            {{ col.label }}
          </th>
        </tr>
      </thead>
      <tbody>
        <tr v-if="!transactions.length">
          <td colspan="5" class="text-text-faint py-4 text-center">Sin movimientos registrados.</td>
        </tr>
        <template v-else>
          <tr
            v-for="transaction in transactions"
            :key="transaction.id"
            class="border-b border-(--line) font-semibold hover:bg-(--bg-subtle)"
          >
            <td class="text-text-muted p-2 font-mono text-sm font-medium">
              {{ transaction.date }}
            </td>
            <td class="text-text-main p-2 font-semibold">
              {{ transaction.description }}
            </td>
            <td class="p-2">
              <span
                class="flex w-fit max-w-37.5 gap-1 rounded-full px-2 py-1 text-xs"
                :class="transactionBadgeClass(transaction.tone)"
              >
                <span>
                  {{ transaction.emoji }}
                </span>
                {{ transaction.category }}
              </span>
            </td>
            <td class="p-2">
              <span class="text-xs" :class="toneTextClass(transaction.tone)">
                {{ transaction.typeLabel }}
              </span>
            </td>
            <td
              class="p-2 text-right! font-mono font-medium"
              :class="toneTextClass(transaction.tone)"
            >
              {{ transaction.sign }}{{ transaction.amount }}
            </td>
          </tr>
        </template>
      </tbody>
    </table>
  </div>

  <div class="grid gap-2 md:hidden" role="region" aria-label="Lista de últimos movimientos">
    <p v-if="!transactions.length" class="text-text-faint py-4 text-center text-sm">
      Sin movimientos registrados.
    </p>
    <template v-else>
      <article
        v-for="transaction in transactions"
        :key="transaction.id"
        class="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-2 rounded-xl border border-(--line) bg-(--bg-subtle) p-3.5"
      >
        <div class="min-w-0">
          <strong
            class="text-text-main block overflow-hidden text-sm text-ellipsis whitespace-nowrap"
          >
            {{ transaction.description }}
          </strong>
          <span class="text-text-faint mt-1 block font-mono text-[0.7rem]">
            {{ transaction.date }} · {{ transaction.typeLabel }}
          </span>
        </div>
        <strong
          class="self-start font-mono text-sm font-medium whitespace-nowrap"
          :class="toneTextClass(transaction.tone)"
        >
          {{ transaction.sign }}{{ transaction.amount }}
        </strong>
        <span
          class="col-span-2 flex w-fit max-w-full gap-1 rounded-full px-2 py-1 text-xs"
          :class="transactionBadgeClass(transaction.tone)"
        >
          <span>{{ transaction.emoji }}</span>
          <span class="overflow-hidden text-ellipsis whitespace-nowrap">
            {{ transaction.category }}
          </span>
        </span>
      </article>
    </template>
  </div>
</template>
