<script setup lang="ts">
import NeonWidgetThumb from './NeonWidgetThumb.vue'
import { WIDGETS, type WidgetId } from './widgets'

// The catalog of the home's edit mode (DESIGN.md, «Inicio en escritorio»): a
// drawer over the page with the widgets that are not on the home. Each one is
// dragged onto the grid or added with its button, at its initial size, in the
// first free place. What is not built yet says «Próximamente».
defineProps<{ absent: WidgetId[] }>()
const emit = defineEmits<{
  add: [id: WidgetId]
  dragStart: [id: WidgetId, event: PointerEvent]
  close: []
}>()
</script>

<template>
  <aside
    class="bg-panel text-text border-line rounded-card shadow-float fixed inset-e-4 inset-bs-20 inset-be-24 z-40 hidden w-80 flex-col gap-3 overflow-hidden border p-4 @4xl:flex"
    aria-labelledby="dashboard-catalog-title"
    data-dashboard-catalog
  >
    <div class="flex items-center justify-between gap-2">
      <h2 id="dashboard-catalog-title" class="text-block-title font-sans font-extrabold">
        Widgets
      </h2>
      <button
        type="button"
        class="text-muted hover:text-text outline-accent -me-2 grid size-10 cursor-pointer place-items-center rounded-full focus-visible:outline-2 focus-visible:outline-offset-2 pointer-coarse:size-11"
        aria-label="Cerrar el panel de widgets"
        @click="emit('close')"
      >
        <svg
          class="size-4"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          aria-hidden="true"
        >
          <path d="M6 6l12 12M18 6 6 18" />
        </svg>
      </button>
    </div>

    <ul class="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto" aria-label="Widgets que faltan">
      <li
        v-for="id in absent"
        :key="id"
        class="border-line bg-panel2 rounded-field flex cursor-grab touch-none flex-col gap-2 border p-3 select-none"
        :data-catalog-widget="id"
        @pointerdown="emit('dragStart', id, $event)"
      >
        <NeonWidgetThumb :id="id" class="text-muted h-24 w-full" />
        <div class="flex items-center justify-between gap-2">
          <span class="flex flex-col">
            <span class="text-sm font-extrabold">{{ WIDGETS[id].title }}</span>
            <span class="text-muted text-meta">
              {{ WIDGETS[id].initial.w }} × {{ WIDGETS[id].initial.h }} casillas
            </span>
          </span>
          <button
            type="button"
            class="bg-accent text-on-accent outline-text rounded-pill min-h-9 cursor-pointer px-4 text-sm font-extrabold focus-visible:outline-2 focus-visible:outline-offset-2 motion-safe:transition-transform motion-safe:duration-160 motion-safe:active:scale-[0.96] pointer-coarse:min-h-11"
            :aria-label="`Añadir ${WIDGETS[id].title} al inicio`"
            :data-catalog-add="id"
            @pointerdown.stop
            @click="emit('add', id)"
          >
            Añadir
          </button>
        </div>
      </li>
      <li v-if="!absent.length" class="text-muted text-note text-pretty" data-catalog-empty>
        Todos los widgets están en el inicio.
      </li>
    </ul>

    <p
      class="border-line text-muted rounded-field border border-dashed px-4 py-3 text-center text-sm font-bold"
      data-catalog-soon
    >
      Próximamente
    </p>
  </aside>
</template>
