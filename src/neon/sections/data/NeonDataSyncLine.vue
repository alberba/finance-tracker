<script setup lang="ts">
import { ref } from 'vue'

import { SYNC_DOT_CLASS, useDataSync } from './use-data-sync'
import { queueToggleLabel } from './view-model'

// «Sincronización» in the mobile frame (artboard «Datos · móvil · Pixel 10»):
// one line above everything else with the state, its meta and a round button
// that syncs now; the queue folds under a text toggle. Same state as the
// desktop card (NeonDataSync).
const { demo, view, queue, syncing, syncNow } = useDataSync()
const queueOpen = ref(false)
</script>

<template>
  <div class="flex min-w-0 flex-col gap-1" data-data-sync>
    <section
      aria-labelledby="data-sync-title"
      class="bg-panel border-line motion-safe:animate-rise rounded-card flex min-h-[62px] min-w-0 items-center gap-3 border py-2 ps-4 pe-2"
    >
      <h2 id="data-sync-title" class="sr-only">Sincronización</h2>
      <span
        class="size-2.5 shrink-0 rounded-full"
        :class="SYNC_DOT_CLASS[view.dot]"
        aria-hidden="true"
      ></span>
      <p class="min-w-0 flex-1 truncate text-[16px] font-bold" role="status" data-sync-state>
        <span data-sync-label>{{ view.label }}</span>
        <span v-if="view.meta" class="text-muted text-meta ms-1.5 font-normal">{{
          view.meta
        }}</span>
      </p>
      <button
        v-if="!demo"
        type="button"
        class="bg-panel2 border-ctrl-line text-text outline-accent grid size-11 shrink-0 place-items-center rounded-full border focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-50 motion-safe:transition-transform motion-safe:duration-160 motion-safe:ease-out motion-safe:enabled:active:scale-[0.97]"
        :aria-label="view.button"
        :aria-busy="syncing"
        :disabled="!view.canSync"
        @click="syncNow"
      >
        <svg
          class="size-5"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
          aria-hidden="true"
        >
          <path d="M4 12a8 8 0 0 1 14-5.3M20 12a8 8 0 0 1-14 5.3M18 3v4h-4M6 21v-4h4" />
        </svg>
      </button>
    </section>

    <template v-if="queue.length">
      <button
        type="button"
        class="text-text outline-accent rounded-pill text-note inline-flex min-h-11 items-center self-start px-4 font-extrabold underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2 motion-safe:transition-transform motion-safe:duration-160 motion-safe:ease-out motion-safe:active:scale-[0.97]"
        :aria-expanded="queueOpen"
        aria-controls="data-sync-queue"
        data-sync-queue-toggle
        @click="queueOpen = !queueOpen"
      >
        {{ queueToggleLabel(queueOpen, queue.length) }}
      </button>
      <ul
        v-show="queueOpen"
        id="data-sync-queue"
        class="bg-panel border-line rounded-card list-none border px-4 py-1"
        aria-label="Cambios pendientes"
        data-sync-queue
      >
        <li
          v-for="row in queue"
          :key="row.key"
          class="border-line flex min-h-16 items-center justify-between gap-3 border-t py-2.5 first:border-t-0"
        >
          <span class="flex min-w-0 flex-col">
            <span class="text-muted text-meta">{{ row.kind }}</span>
            <span class="truncate text-[15px] font-bold">{{ row.text }}</span>
          </span>
          <span class="text-muted text-meta shrink-0">{{ row.act }}</span>
        </li>
      </ul>
    </template>
  </div>
</template>
