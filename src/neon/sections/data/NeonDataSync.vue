<script setup lang="ts">
import { storeToRefs } from 'pinia'
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'

import { isDemoMode } from '../../../scripts/demo-mode'
import { useSyncStore } from '../../../stores/sync'
import NeonButton from '../../ui/NeonButton.vue'
import { queueRows, syncView, type QueueRow } from './view-model'

// «Sincronización» (artboard «Datos · 2560 px»): whether this device holds the
// latest data, how many changes still wait to be sent and what they are, and
// the button that sends them now. The demo keeps its data in the browser and
// has no server to sync with.
const syncStore = useSyncStore()
const { connection, syncStatus, pendingCount, lastCheckedAt } = storeToRefs(syncStore)
const demo = isDemoMode()

const now = ref(Date.now())
let ticker: ReturnType<typeof setInterval> | undefined
onMounted(() => (ticker = setInterval(() => (now.value = Date.now()), 5000)))
onBeforeUnmount(() => clearInterval(ticker))

const view = computed(() =>
  syncView({
    demo,
    online: connection.value === 'online',
    status: syncStatus.value,
    pendingCount: pendingCount.value,
    lastCheckedAt: lastCheckedAt.value,
    now: now.value,
  }),
)

const queue = ref<QueueRow[]>([])
watch(
  [pendingCount, syncStatus],
  async () => {
    queue.value = pendingCount.value > 0 ? queueRows(await syncStore.listPending()) : []
  },
  { immediate: true },
)

const DOT = { ok: 'bg-gain', pending: 'bg-accent', idle: 'bg-soft' } as const
</script>

<template>
  <section
    aria-labelledby="data-sync-title"
    class="bg-panel border-line rounded-card motion-safe:animate-rise flex min-w-0 flex-col gap-4 border px-6 py-[22px] motion-safe:[animation-delay:140ms] @max-lg:px-3 @max-lg:py-4"
    data-data-sync
  >
    <h2 id="data-sync-title" class="text-block-title font-sans font-extrabold">Sincronización</h2>

    <div class="flex min-w-0 flex-wrap items-center gap-2.5" role="status" data-sync-state>
      <span class="size-2.5 shrink-0 rounded-full" :class="DOT[view.dot]" aria-hidden="true"></span>
      <span class="text-[16px] font-bold" data-sync-label>{{ view.label }}</span>
      <span v-if="view.meta" class="text-muted text-[13px]">{{ view.meta }}</span>
    </div>

    <div class="flex flex-wrap items-baseline gap-x-3.5 gap-y-1.5">
      <span
        class="font-display text-figure-hero leading-[1.05] font-bold tracking-[-0.035em] tabular-nums"
        data-sync-pending
        >{{ view.pending.figure }}</span
      >
      <span class="text-soft text-[16px]">{{ view.pending.word }}</span>
    </div>

    <ul v-if="queue.length" class="list-none" aria-label="Cambios pendientes" data-sync-queue>
      <li
        v-for="row in queue"
        :key="row.key"
        class="border-line flex min-h-16 items-center justify-between gap-3 border-t py-2.5"
      >
        <span class="flex min-w-0 flex-col">
          <span class="text-muted text-[13px]">{{ row.kind }}</span>
          <span class="truncate text-[15px] font-bold">{{ row.text }}</span>
        </span>
        <span class="text-muted shrink-0 text-[13px]">{{ row.act }}</span>
      </li>
    </ul>
    <p v-else-if="!demo" class="text-soft text-[15px]">
      Todo está enviado. Lo que hagas sin conexión se guarda aquí hasta que sincroniza.
    </p>

    <NeonButton
      v-if="!demo"
      variant="primary"
      class="mt-auto self-start"
      :disabled="!view.canSync"
      :aria-busy="syncStatus === 'syncing'"
      @click="syncStore.syncNow()"
    >
      {{ view.button }}
    </NeonButton>
  </section>
</template>
