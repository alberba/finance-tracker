<script setup lang="ts">
import { computed, ref, watch } from 'vue'

import type { WealthViewModel } from '../../../domain/wealth/view-model'
import type { Month } from '../../../lib/month'
import type { SnapshotKind } from '../../../scripts/types'
import NeonDetailPanel from '../../ui/NeonDetailPanel.vue'
import NeonWealthAccountBody from './NeonWealthAccountBody.vue'
import { accountDetail } from './view-model'

// One account, asset or debt month by month, in the shared detail panel (the
// phone; the desktop shows it in a popover beside its row). Opens from a row
// of «Lo que tienes».
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
</script>

<template>
  <NeonDetailPanel v-model:open="open" :title="detail?.name ?? ''" :kicker="detail?.group">
    <NeonWealthAccountBody v-if="detail" v-model:picked="picked" :detail="detail" />
  </NeonDetailPanel>
</template>
