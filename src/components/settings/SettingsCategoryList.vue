<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, useTemplateRef } from 'vue'

import EmojiPickerPanel from './EmojiPickerPanel.vue'
import BaseButton from '../ui/BaseButton.vue'
import BaseInput from '../ui/BaseInput.vue'
import ConfirmDialog from '../ui/ConfirmDialog.vue'
import IconButton from '../ui/IconButton.vue'
import type { CategoryTagViewModel } from '../../domain/settings/view-model'
import type { CategoryKey } from '../../scripts/types'
import { useSettingsStore } from '../../stores/settings'

// One list of categories (income, expense or investment) in the order the
// selects show them: each with its emoji, moved up or down, or removed; a new
// one is added at the end.
const props = defineProps<{
  title: string
  categoryKey: CategoryKey
  tags: CategoryTagViewModel[]
}>()

const settingsStore = useSettingsStore()
const name = ref('')
const openPickerFor = ref<string | null>(null)
const root = useTemplateRef<HTMLElement>('root')
const pendingDelete = ref<string | null>(null)
const confirmOpen = computed({
  get: () => pendingDelete.value !== null,
  set: (value: boolean) => {
    if (!value) pendingDelete.value = null
  },
})

function confirmDelete(): void {
  if (pendingDelete.value) settingsStore.removeCategory(props.categoryKey, pendingDelete.value)
}

function add(): void {
  if (settingsStore.addCategory(props.categoryKey, name.value)) name.value = ''
}

function togglePicker(tagName: string): void {
  openPickerFor.value = openPickerFor.value === tagName ? null : tagName
}

function selectEmoji(tagName: string, emoji: string): void {
  settingsStore.setCategoryEmoji(props.categoryKey, tagName, emoji)
  openPickerFor.value = null
}

function resetEmoji(tagName: string): void {
  settingsStore.resetCategoryEmoji(props.categoryKey, tagName)
  openPickerFor.value = null
}

// The picker closes when the pointer goes elsewhere or with Escape.
function onDocumentPointerDown(event: PointerEvent): void {
  const target = event.target instanceof Element ? event.target : null
  if (openPickerFor.value && !(target && root.value?.contains(target))) openPickerFor.value = null
}

function onDocumentKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape') openPickerFor.value = null
}

onMounted(() => {
  document.addEventListener('pointerdown', onDocumentPointerDown)
  document.addEventListener('keydown', onDocumentKeydown)
})

onBeforeUnmount(() => {
  document.removeEventListener('pointerdown', onDocumentPointerDown)
  document.removeEventListener('keydown', onDocumentKeydown)
})
</script>

<template>
  <section ref="root" class="grid content-start gap-2" :data-category-list="categoryKey">
    <h4 class="font-display text-text-main flex items-baseline gap-2 text-lg font-bold">
      {{ title }}
      <span class="text-text-muted text-xs font-medium tabular-nums">{{ tags.length }}</span>
    </h4>
    <ol class="grid" :aria-label="`Categorías de ${title.toLowerCase()}`">
      <li
        v-for="(tag, index) in tags"
        :key="tag.name"
        class="border-line relative grid grid-cols-[1.5rem_2.75rem_1fr_auto] items-center gap-2 border-t py-1"
        :data-category="tag.name"
      >
        <span class="font-display text-text-muted text-xs tabular-nums">
          {{ String(index + 1).padStart(2, '0') }}
        </span>
        <button
          type="button"
          class="bg-subtle hover:bg-line focus-visible:outline-primary flex size-11 items-center justify-center rounded-md text-lg focus-visible:outline-2"
          :aria-label="`Cambiar emoji de ${tag.name}`"
          :aria-expanded="openPickerFor === tag.name"
          @click="togglePicker(tag.name)"
        >
          {{ tag.emoji }}
        </button>
        <span class="min-w-0 truncate font-semibold">{{ tag.name }}</span>
        <span class="flex" role="group" :aria-label="`Ordenar ${tag.name}`">
          <IconButton
            icon="arrow-up"
            :label="`Subir ${tag.name}`"
            :disabled="index === 0"
            @click="settingsStore.reorderCategory(categoryKey, tag.name, 'up')"
          />
          <IconButton
            icon="arrow-down"
            :label="`Bajar ${tag.name}`"
            :disabled="index === tags.length - 1"
            @click="settingsStore.reorderCategory(categoryKey, tag.name, 'down')"
          />
          <IconButton
            icon="trash"
            tone="danger"
            :label="`Eliminar categoría ${tag.name}`"
            @click="pendingDelete = tag.name"
          />
        </span>
        <EmojiPickerPanel
          v-if="openPickerFor === tag.name"
          :model-value="tag.emoji"
          :is-custom="tag.isCustomEmoji"
          :category="tag.name"
          class="absolute top-full left-8 z-20 mt-1"
          @select="selectEmoji(tag.name, $event)"
          @reset="resetEmoji(tag.name)"
          @close="openPickerFor = null"
        />
      </li>
    </ol>
    <p v-if="!tags.length" class="text-text-muted text-sm">Sin categorías.</p>
    <form
      class="grid grid-cols-[1fr_auto] items-end gap-2 pt-2"
      autocomplete="off"
      @submit.prevent="add"
    >
      <BaseInput
        v-model="name"
        :label="`Nueva categoría de ${title.toLowerCase()}`"
        hide-label
        name="name"
        placeholder="Nueva categoría"
        required
      />
      <BaseButton type="submit">Añadir</BaseButton>
    </form>
    <ConfirmDialog
      v-model:open="confirmOpen"
      title="¿Eliminar esta categoría?"
      :title-id="`settings-category-delete-title-${categoryKey}`"
      confirm-label="Eliminar categoría"
      @confirm="confirmDelete"
    >
      <template v-if="pendingDelete">
        {{ pendingDelete }} deja de aparecer al elegir categoría y pierde su emoji.
      </template>
    </ConfirmDialog>
  </section>
</template>
