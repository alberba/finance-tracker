<script setup lang="ts">
// Fila de un adjunto en un borrador o en el editor de una aclaración. La
// acción (botón o icono) la decide quien la usa; así el mismo patrón sirve en
// el alta, el compositor y la edición.
export interface AttachmentRow {
  id: string | number
  name: string
  previewUrl: string
}

defineProps<{ items: AttachmentRow[]; label?: string }>()
</script>

<template>
  <ul v-if="items.length > 0" class="grid gap-2" :aria-label="label">
    <li
      v-for="item in items"
      :key="item.id"
      class="bg-subtle flex items-center gap-3 rounded-md p-2"
    >
      <img
        :src="item.previewUrl"
        :alt="`Vista previa de ${item.name}`"
        class="size-14 shrink-0 rounded-md object-cover"
      />
      <span class="text-text-main min-w-0 flex-1 truncate text-sm">{{ item.name }}</span>
      <slot name="action" :item="item" />
    </li>
  </ul>
</template>
