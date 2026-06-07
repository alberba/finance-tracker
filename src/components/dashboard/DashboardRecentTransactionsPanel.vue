<script setup lang="ts">
import type {
  DashboardRecentTransaction,
  DashboardTransactionTone,
} from '../../scripts/app/dashboard-view-model'

defineProps<{
  transactions: DashboardRecentTransaction[]
}>()

const emit = defineEmits<{
  navigate: [target: string]
}>()

function transactionAmountClass(tone: DashboardTransactionTone): string {
  if (tone === 'income') {
    return 'text-good text-(--income)'
  }
  if (tone === 'expense') {
    return 'text-bad text-(--expense)'
  }
  return 'rt-amount--invest text-(--invest)'
}

function transactionBadgeClass(tone: DashboardTransactionTone): string {
  if (tone === 'income') {
    return 'badge-income bg-(--income-bg) text-(--income)'
  }
  if (tone === 'expense') {
    return 'badge-expense bg-(--expense-bg) text-(--expense)'
  }
  return 'badge-investment bg-(--invest-bg) text-(--invest)'
}

function transactionTypeClass(tone: DashboardTransactionTone): string {
  if (tone === 'income') {
    return 'rt-type--income text-(--income)'
  }
  if (tone === 'expense') {
    return 'rt-type--expense text-(--expense)'
  }
  return 'rt-type--investment text-(--invest)'
}
</script>

<template>
  <article
    class="dash-panel dash-panel--wide flex min-w-0 flex-col gap-3.5 rounded-lg border border-(--line) bg-(--bg-panel) p-[clamp(18px,1.9vw,24px)] [box-shadow:var(--shadow-soft)]"
  >
    <h3 class="dash-panel-title text-base font-bold tracking-[-0.01em] text-(--text-main)">
      Últimos movimientos
    </h3>
    <div class="recent-tx-wrap -mt-0.5 max-w-full min-w-0 overflow-x-auto">
      <table
        class="recent-tx w-full border-collapse text-[0.86rem] [&_tbody_td]:border-b [&_tbody_td]:border-(--line) [&_tbody_td]:py-2.5 [&_tbody_td]:pr-3 [&_tbody_td]:pl-0 [&_tbody_td]:align-middle [&_tbody_tr:last-child_td]:border-b-0 [&_thead_th]:border-b [&_thead_th]:border-(--line) [&_thead_th]:px-0 [&_thead_th]:pt-0 [&_thead_th]:pr-3 [&_thead_th]:pb-2 [&_thead_th]:text-left [&_thead_th]:text-[0.64rem] [&_thead_th]:font-bold [&_thead_th]:tracking-[0.08em] [&_thead_th]:whitespace-nowrap [&_thead_th]:text-(--text-faint) [&_thead_th]:uppercase"
      >
        <thead>
          <tr>
            <th scope="col">Fecha</th>
            <th scope="col">Descripción</th>
            <th scope="col">Categoría</th>
            <th scope="col">Tipo</th>
            <th scope="col" class="num pr-0! text-right!">Importe</th>
          </tr>
        </thead>
        <tbody id="recent-tx-body">
          <tr v-if="!transactions.length">
            <td colspan="5" class="recent-tx-empty py-4 text-center text-(--text-faint)">
              Sin movimientos registrados.
            </td>
          </tr>
          <template v-else>
            <tr v-for="transaction in transactions" :key="transaction.id">
              <td
                class="rt-date font-['DM_Mono',monospace] text-[0.8rem] whitespace-nowrap text-(--text-muted)"
              >
                {{ transaction.date }}
              </td>
              <td class="rt-desc font-semibold text-(--text-main)">
                {{ transaction.description }}
              </td>
              <td>
                <span
                  class="rt-pill inline-block max-w-[150px] overflow-hidden rounded-full px-2.5 py-[3px] text-[0.72rem] font-semibold text-ellipsis whitespace-nowrap"
                  :class="transactionBadgeClass(transaction.tone)"
                >
                  {{ transaction.category }}
                </span>
              </td>
              <td>
                <span
                  class="rt-type text-[0.78rem] font-semibold"
                  :class="transactionTypeClass(transaction.tone)"
                >
                  {{ transaction.typeLabel }}
                </span>
              </td>
              <td
                class="num rt-amount pr-0! text-right! font-['DM_Mono',monospace] font-medium whitespace-nowrap tabular-nums"
                :class="transactionAmountClass(transaction.tone)"
              >
                {{ transaction.sign }}{{ transaction.amount }}
              </td>
            </tr>
          </template>
        </tbody>
      </table>
    </div>
    <button
      type="button"
      class="dash-more mt-auto inline-flex min-h-0 items-center gap-1.5 border-t border-(--line) bg-transparent px-0 pt-3 pb-0 text-[0.85rem] font-semibold text-(--primary) [&_svg]:h-3.5 [&_svg]:w-3.5 [&_svg]:transition-transform hover:[&_svg]:translate-x-0.75"
      data-goto="transactions"
      @click="emit('navigate', 'transactions')"
    >
      Ver todos los movimientos
      <svg
        viewBox="0 0 20 20"
        fill="none"
        stroke="currentColor"
        stroke-width="1.7"
        aria-hidden="true"
      >
        <path d="M4 10h11M11 6l4 4-4 4"></path>
      </svg>
    </button>
  </article>
</template>
