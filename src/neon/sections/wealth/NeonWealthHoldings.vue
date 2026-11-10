<script setup lang="ts">
import type { SnapshotKind } from '../../../scripts/types'
import type { HoldingGroup } from './view-model'

// «Lo que tienes»: one card per group (cash, investment, debt) with its total
// and its accounts as ledger rows. A row opens that account's detail.
defineProps<{ groups: HoldingGroup[]; date: string }>()
const emit = defineEmits<{ open: [kind: SnapshotKind, id: string] }>()
</script>

<template>
  <section aria-labelledby="wealth-have-title" class="grid min-w-0 gap-3">
    <div class="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1.5">
      <h2 id="wealth-have-title" class="text-block-title font-extrabold">Lo que tienes</h2>
      <p class="text-muted text-note">{{ date }}</p>
    </div>
    <div
      class="grid min-w-0 grid-cols-1 items-start gap-3.5 @min-[900px]:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,0.8fr)]"
    >
      <section
        v-for="group in groups"
        :key="group.kind"
        :aria-label="group.title"
        class="bg-panel border-line rounded-card grid min-w-0 content-start border px-6 py-[22px]"
        :data-wealth-group="group.kind"
      >
        <div class="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-0.5 pbe-3.5">
          <h3 class="text-[18px] leading-[1.2] font-extrabold">{{ group.title }}</h3>
          <span
            class="font-display text-[20px] leading-[1.2] font-semibold tracking-[-0.02em] whitespace-nowrap tabular-nums"
            data-wealth-group-total
            >{{ group.total }}</span
          >
          <span class="text-muted text-meta">{{ group.count }}</span>
        </div>
        <p v-if="!group.rows.length" class="text-muted border-line text-note border-t pbs-3.5">
          Nada apuntado en este grupo.
        </p>
        <ul v-else>
          <li v-for="row in group.rows" :key="row.id" class="border-line border-t">
            <button
              type="button"
              class="text-text outline-accent hover:bg-panel2/60 grid min-h-16 w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 py-2.5 text-start focus-visible:outline-2 focus-visible:-outline-offset-2"
              :aria-label="`${row.name}: ${row.value}. Ver mes a mes`"
              @click="emit('open', row.kind, row.id)"
            >
              <span class="grid min-w-0 gap-px">
                <span class="truncate text-[16px] font-bold">{{ row.name }}</span>
                <span class="text-muted text-meta truncate">{{ row.note }}</span>
              </span>
              <span class="grid justify-items-end gap-px">
                <span
                  class="font-display text-end text-[16px] font-semibold whitespace-nowrap tabular-nums"
                  :class="row.empty ? 'text-muted' : 'text-text'"
                  >{{ row.value }}</span
                >
                <span class="text-muted text-meta tabular-nums">{{ row.share }}</span>
              </span>
            </button>
          </li>
        </ul>
      </section>
    </div>
  </section>
</template>
