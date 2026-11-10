<script setup lang="ts">
import { computed, nextTick, ref, useTemplateRef, watch } from 'vue'

import type { WealthViewModel } from '../../../domain/wealth/view-model'
import type { Month } from '../../../lib/month'
import type { SnapshotKind } from '../../../scripts/types'
import NeonDetailPanel from '../../ui/NeonDetailPanel.vue'
import NeonFigure from '../../ui/NeonFigure.vue'
import { accountDetail, type FigureTone } from './view-model'

// One account, asset or debt month by month, in the shared detail panel: its
// balance and how it moved from the month before, a bar per month (pick one
// to read it) and three figures. Opens from a row of «Lo que tienes».
const props = defineProps<{
  view: WealthViewModel
  target: { kind: SnapshotKind; id: string } | null
  /** The month it opens on: the cover's. */
  month: Month
}>()

const open = defineModel<boolean>('open', { required: true })

const picked = ref<Month>(props.month)
watch(
  () => [props.target, props.month] as const,
  () => (picked.value = props.month),
)

const detail = computed(() =>
  props.target ? accountDetail(props.view, props.target.kind, props.target.id, picked.value) : null,
)

// With a finger, every bar is 44px wide and a long year scrolls: keep the
// picked month in sight.
const barsGroup = useTemplateRef<HTMLElement>('barsGroup')
watch(
  () => [open.value, picked.value, detail.value?.bars.length] as const,
  async ([isOpen]) => {
    if (!isOpen) return
    await nextTick()
    barsGroup.value
      ?.querySelector<HTMLElement>('[aria-pressed="true"]')
      ?.scrollIntoView?.({ inline: 'center', block: 'nearest' })
  },
  { flush: 'post' },
)

const TONE_CLASS: Record<FigureTone, string> = {
  gain: 'text-gain',
  loss: 'text-loss',
  muted: 'text-muted',
  plain: 'text-text',
}
</script>

<template>
  <NeonDetailPanel v-model:open="open" :title="detail?.name ?? ''" :kicker="detail?.group">
    <template v-if="detail">
      <div class="grid justify-items-start gap-1.5">
        <NeonFigure
          :value="detail.value"
          class="text-[30px] leading-[1.1] font-bold tracking-[-0.035em]"
          data-account-value
        />
        <span
          v-if="detail.delta"
          class="text-note font-extrabold"
          :class="TONE_CLASS[detail.delta.tone]"
          >{{ detail.delta.text
          }}<span class="text-muted text-meta ms-3 font-normal">{{ detail.delta.note }}</span></span
        >
        <span v-else class="text-muted text-meta">Primer mes del año</span>
      </div>

      <div
        ref="barsGroup"
        role="group"
        :aria-label="`Saldo de ${detail.name} mes a mes`"
        class="bg-panel2 rounded-tile grid items-end gap-x-2 overflow-x-auto px-3 pt-3.5 pb-2.5 [--bar-min:0px] pointer-coarse:[--bar-min:44px]"
        :style="{
          gridTemplateColumns: `repeat(${detail.bars.length}, minmax(var(--bar-min), 1fr))`,
        }"
      >
        <button
          v-for="bar in detail.bars"
          :key="bar.month"
          type="button"
          :aria-pressed="bar.selected"
          :aria-label="bar.aria"
          class="outline-accent grid h-28 content-end justify-items-center gap-1.5 rounded-md focus-visible:outline-2 focus-visible:outline-offset-2"
          @click="picked = bar.month"
        >
          <span
            class="w-full rounded-md"
            :class="bar.selected ? 'bg-accent' : 'bg-neutral-bar'"
            :style="{ height: `${(bar.height / 100) * 76}px` }"
          ></span>
          <span class="text-xs font-bold" :class="bar.selected ? 'text-text' : 'text-muted'">{{
            bar.label
          }}</span>
        </button>
      </div>

      <div class="frame:grid-cols-3 grid grid-cols-1 gap-2">
        <div
          v-for="tile in detail.tiles"
          :key="tile.label"
          class="bg-panel2 rounded-tile frame:grid frame:gap-0.5 flex min-w-0 items-baseline justify-between gap-3 p-3"
        >
          <span class="text-muted text-meta">{{ tile.label }}</span>
          <span
            class="font-display truncate text-[16px] font-semibold tabular-nums"
            :class="TONE_CLASS[tile.tone]"
            >{{ tile.value }}</span
          >
        </div>
      </div>
    </template>
  </NeonDetailPanel>
</template>
