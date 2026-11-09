<script setup lang="ts">
import { useMoneyFormatter } from '../../../composables/useMoneyFormatter'
import NeonDetailPanel from '../../ui/NeonDetailPanel.vue'
import { averageLabel, MONTH_INITIALS, type CategoryDetail } from './month-view-model'

// One expense category month by month, in the shared detail panel: the year's
// figures, a bar per month against the current budget (dashed) and the list of
// months, newest first.
defineProps<{ detail: CategoryDetail | null; year: number }>()

const open = defineModel<boolean>('open', { required: true })

const { formatMoney } = useMoneyFormatter()

const BAR_CLASS = {
  over: 'bg-loss',
  current: 'bg-accent',
  normal: 'bg-neutral-bar',
  empty: 'opacity-0',
} as const
</script>

<template>
  <NeonDetailPanel
    v-model:open="open"
    :title="detail?.category ?? ''"
    :kicker="`Mes a mes · ${year}`"
  >
    <template v-if="detail">
      <div
        role="group"
        aria-label="Cifras del año"
        class="border-line grid grid-cols-3 border-y py-3"
      >
        <div class="grid min-w-0 gap-0.5">
          <span class="text-muted text-[13px]">{{ averageLabel(detail.closedCount) }}</span>
          <span
            class="font-display truncate text-[16px] font-semibold"
            :class="
              detail.average !== null && detail.average > detail.plan + 0.005 ? 'text-loss' : ''
            "
          >
            {{ detail.average === null ? '—' : formatMoney(detail.average) }}
          </span>
        </div>
        <div class="border-line grid min-w-0 gap-0.5 border-s ps-3.5">
          <span class="text-muted text-[13px]">Meses por encima</span>
          <span
            class="font-display truncate text-[16px] font-semibold"
            :class="detail.overCount ? 'text-loss' : ''"
          >
            {{ detail.closedCount ? `${detail.overCount} de ${detail.closedCount}` : '—' }}
          </span>
        </div>
        <div class="border-line grid min-w-0 gap-0.5 border-s ps-3.5">
          <span class="text-muted text-[13px]">Llevas en {{ year }}</span>
          <span class="font-display truncate text-[16px] font-semibold">
            {{ formatMoney(detail.yearToDate) }}
          </span>
        </div>
      </div>

      <div class="grid">
        <div
          role="img"
          :aria-label="`Gasto mensual de ${detail.category} en ${year} frente a un presupuesto de ${formatMoney(detail.plan)} al mes`"
          class="border-grid relative grid h-[132px] grid-cols-12 items-end gap-1.5 border-b"
        >
          <span
            class="border-faint absolute inset-x-0 border-t border-dashed"
            :style="{ insetBlockEnd: `${detail.planLine}%` }"
            aria-hidden="true"
          ></span>
          <span
            v-for="bar in detail.bars"
            :key="bar.month"
            class="relative block min-h-0.5 rounded-t-[4px]"
            :class="BAR_CLASS[bar.kind]"
            :style="{ height: `${bar.height}%` }"
            aria-hidden="true"
          ></span>
        </div>
        <div class="grid grid-cols-12 gap-1.5 pt-1.5" aria-hidden="true">
          <span
            v-for="bar in detail.bars"
            :key="bar.month"
            class="text-center text-[11px] font-bold"
            :class="bar.kind === 'current' ? 'text-text' : 'text-muted'"
          >
            {{ MONTH_INITIALS[bar.month - 1] }}
          </span>
        </div>
        <p class="text-muted mt-2 text-[13px]">
          La línea discontinua es el presupuesto mensual ({{ formatMoney(detail.plan) }}).
          {{ detail.reading }}
        </p>
      </div>

      <ul class="grid" aria-label="Meses">
        <li
          v-for="row in detail.rows"
          :key="row.month"
          class="border-line grid min-h-[52px] grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 border-t py-1.5"
        >
          <span class="grid min-w-0">
            <span class="text-[15px] font-bold">{{ row.name }}</span>
            <span class="text-muted text-[13px]">{{ row.sub }}</span>
          </span>
          <span class="grid justify-items-end">
            <span
              class="font-display text-[15px] font-semibold"
              :class="row.over ? 'text-loss' : ''"
            >
              {{ formatMoney(row.value) }}
            </span>
            <span class="text-[13px] font-bold" :class="row.over ? 'text-loss' : 'text-muted'">
              {{ row.dev }}
            </span>
          </span>
        </li>
      </ul>
    </template>
  </NeonDetailPanel>
</template>
