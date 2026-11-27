<script setup lang="ts">
import { computed, ref, watch } from 'vue'

import type { WealthViewModel } from '../../../domain/wealth/view-model'
import type { Month } from '../../../lib/month'
import type { SnapshotKind } from '../../../scripts/types'
import NeonRowPopover from '../../ui/NeonRowPopover.vue'
import NeonWealthAccountBody from './NeonWealthAccountBody.vue'
import { accountDetail } from './view-model'

// One account, asset or debt month by month on the desktop, in a popover
// beside its row of «Lo que tienes». The phone shows it in a detail panel.
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
const anchor = computed(() =>
  open.value && props.target
    ? document.querySelector<HTMLElement>(
        `[data-wealth-account="${CSS.escape(`${props.target.kind}:${props.target.id}`)}"]`,
      )
    : null,
)
</script>

<template>
  <NeonRowPopover
    v-if="detail"
    v-model:open="open"
    :title="detail.name"
    :kicker="detail.group"
    :anchor="anchor"
    rows="[data-wealth-account]"
    data-wealth-detail
  >
    <NeonWealthAccountBody v-model:picked="picked" :detail="detail" />
  </NeonRowPopover>
</template>
