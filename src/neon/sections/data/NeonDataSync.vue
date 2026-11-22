<script setup lang="ts">
import NeonButton from '../../ui/NeonButton.vue'
import NeonCard from '../../ui/NeonCard.vue'
import { SYNC_DOT_CLASS, useDataSync } from './use-data-sync'

// «Sincronización» (artboard «Datos · 2560 px»): whether this device holds the
// latest data, how many changes still wait to be sent and what they are, and
// the button that sends them now. The mobile frame shows the same state as a
// single line (NeonDataSyncLine).
const { demo, view, queue, syncing, syncNow } = useDataSync()
</script>

<template>
  <NeonCard
    title="Sincronización"
    title-id="data-sync-title"
    class="motion-safe:animate-rise motion-safe:[animation-delay:140ms]"
    data-data-sync
  >
    <div class="flex min-w-0 flex-wrap items-center gap-2.5" role="status" data-sync-state>
      <span
        class="size-2.5 shrink-0 rounded-full"
        :class="SYNC_DOT_CLASS[view.dot]"
        aria-hidden="true"
      ></span>
      <span class="text-[16px] font-bold" data-sync-label>{{ view.label }}</span>
      <span v-if="view.meta" class="text-muted text-meta">{{ view.meta }}</span>
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
          <span class="text-muted text-meta">{{ row.kind }}</span>
          <span class="truncate text-[15px] font-bold">{{ row.text }}</span>
        </span>
        <span class="text-muted text-meta shrink-0">{{ row.act }}</span>
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
      :aria-busy="syncing"
      @click="syncNow"
    >
      {{ view.button }}
    </NeonButton>
  </NeonCard>
</template>
