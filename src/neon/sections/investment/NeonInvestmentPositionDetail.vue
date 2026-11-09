<script setup lang="ts">
import NeonDetailPanel from '../../ui/NeonDetailPanel.vue'
import type { PositionDetail, Tone } from './view-model'

// A position opened from the cover, in the shared detail panel: its figures
// and its latest operations, newest first. The full asset page («‹ VWCE») is
// #439; until then this is where a position leads.
defineProps<{ title: string; kicker: string; detail: PositionDetail | null }>()

const open = defineModel<boolean>('open', { required: true })

const TONE_TEXT: Record<Tone, string> = {
  gain: 'text-gain',
  loss: 'text-loss',
  neutral: 'text-text',
}
</script>

<template>
  <NeonDetailPanel v-model:open="open" :title="title" :kicker="kicker">
    <template v-if="detail">
      <dl class="m-0 grid grid-cols-2 gap-x-5 gap-y-4" aria-label="Cifras de la posición">
        <div v-for="figure in detail.figures" :key="figure.label" class="grid min-w-0 gap-0.5">
          <dt class="text-muted text-[13px]">{{ figure.label }}</dt>
          <dd
            class="font-display m-0 truncate text-[16px] font-semibold tabular-nums"
            :class="TONE_TEXT[figure.tone]"
          >
            {{ figure.value }}
          </dd>
        </div>
      </dl>
      <section class="grid gap-2" aria-labelledby="investment-detail-operations">
        <h3 id="investment-detail-operations" class="text-block-title font-extrabold">
          Operaciones
        </h3>
        <p v-if="!detail.movements.length" class="text-muted text-note">
          Aún no hay operaciones apuntadas.
        </p>
        <ul v-else class="m-0 list-none p-0">
          <li
            v-for="movement in detail.movements"
            :key="movement.id"
            class="border-line flex min-h-16 items-center justify-between gap-3 border-t py-2.5"
          >
            <span class="grid min-w-0 gap-0.5">
              <span class="truncate text-[16px] font-bold">{{ movement.title }}</span>
              <span class="text-muted truncate text-[13px]">{{ movement.meta }}</span>
            </span>
            <span class="font-display flex-none text-[16px] font-semibold tabular-nums">
              {{ movement.amount }}
            </span>
          </li>
        </ul>
      </section>
    </template>
  </NeonDetailPanel>
</template>
