import { storeToRefs } from 'pinia'
import { computed, onBeforeUnmount, onMounted, ref, watch, type ComputedRef, type Ref } from 'vue'

import { useDataStore } from '../../../stores/data'
import { useSyncStore } from '../../../stores/sync'
import { queueRows, syncView, type QueueRow, type SyncDot, type SyncView } from './view-model'

/** The colour of the dot beside the sync state. */
export const SYNC_DOT_CLASS: Record<SyncDot, string> = {
  ok: 'bg-gain',
  pending: 'bg-accent',
  idle: 'bg-soft',
}

export interface DataSync {
  /** The demo keeps its data in the browser and has no server to sync with. */
  demo: boolean
  view: ComputedRef<SyncView>
  /** What waits in the outbox, refreshed when the count or the state changes. */
  queue: Ref<QueueRow[]>
  syncing: ComputedRef<boolean>
  syncNow: () => void
}

/**
 * The state of «Sincronización» for both compositions of Datos: the card on
 * desktop and the one-line status on mobile. «hace 12 s» ticks every 5 s.
 */
export function useDataSync(): DataSync {
  const syncStore = useSyncStore()
  const { connection, syncStatus, pendingCount, lastCheckedAt } = storeToRefs(syncStore)
  const demo = !useDataStore().backsUpServerData

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

  return {
    demo,
    view,
    queue,
    syncing: computed(() => syncStatus.value === 'syncing'),
    syncNow: () => void syncStore.syncNow(),
  }
}
