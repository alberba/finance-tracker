<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, useTemplateRef } from 'vue'

import type { CategoryTagViewModel } from '../../domain/settings/view-model'
import type { CategoryKey } from '../../scripts/types'
import { useSettingsStore } from '../../stores/settings'
import EmojiPickerPanel from './EmojiPickerPanel.vue'

const props = defineProps<{
  title: string
  categoryKey: CategoryKey
  formId: string
  listId: string
  tags: CategoryTagViewModel[]
}>()

const settingsStore = useSettingsStore()
const name = ref('')
const openPickerFor = ref<string | null>(null)
const rootRef = useTemplateRef<HTMLElement>('root')

function onAdd(): void {
  if (settingsStore.addCategory(props.categoryKey, name.value)) {
    name.value = ''
  }
}

function togglePicker(tagName: string): void {
  openPickerFor.value = openPickerFor.value === tagName ? null : tagName
}

function onSelectEmoji(tagName: string, emoji: string): void {
  settingsStore.setCategoryEmoji(props.categoryKey, tagName, emoji)
}

function onResetEmoji(tagName: string): void {
  settingsStore.resetCategoryEmoji(props.categoryKey, tagName)
  openPickerFor.value = null
}

function move(tagName: string, direction: 'up' | 'down'): void {
  settingsStore.reorderCategory(props.categoryKey, tagName, direction)
}

function onDocumentPointerDown(event: PointerEvent): void {
  if (!openPickerFor.value) {
    return
  }
  const target = event.target instanceof Element ? event.target : null
  if (target && rootRef.value?.contains(target)) {
    return
  }
  openPickerFor.value = null
}

function onDocumentKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape') {
    openPickerFor.value = null
  }
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
  <div ref="root" class="category-block">
    <h4>{{ title }}</h4>
    <form :id="formId" class="mini-form compact-row" autocomplete="off" @submit.prevent="onAdd">
      <input
        v-model="name"
        type="text"
        name="name"
        placeholder="Nueva categoría"
        required
        autocomplete="off"
      />
      <button type="submit" class="secondary-btn">Agregar</button>
    </form>
    <div :id="listId" class="category-tag-list">
      <small v-if="!tags.length">Sin categorías.</small>
      <div v-for="(tag, index) in tags" :key="tag.name" class="category-tag-row">
        <div class="category-tag">
          <button
            type="button"
            class="category-tag__emoji"
            :aria-label="`Cambiar emoji de ${tag.name}`"
            :aria-expanded="openPickerFor === tag.name ? 'true' : 'false'"
            @click="togglePicker(tag.name)"
          >
            {{ tag.emoji }}
          </button>
          <span class="category-tag__name">{{ tag.name }}</span>
          <div class="category-tag__order" role="group" aria-label="Reordenar">
            <button
              type="button"
              class="icon-btn"
              :disabled="index === 0"
              :aria-label="`Subir ${tag.name}`"
              @click="move(tag.name, 'up')"
            >
              ↑
            </button>
            <button
              type="button"
              class="icon-btn"
              :disabled="index === tags.length - 1"
              :aria-label="`Bajar ${tag.name}`"
              @click="move(tag.name, 'down')"
            >
              ↓
            </button>
          </div>
          <button
            class="icon-btn"
            type="button"
            :aria-label="`Eliminar categoría ${tag.name}`"
            @click="settingsStore.removeCategory(categoryKey, tag.name)"
          >
            ×
          </button>
        </div>
        <EmojiPickerPanel
          v-if="openPickerFor === tag.name"
          :model-value="tag.emoji"
          :is-custom="tag.isCustomEmoji"
          class="category-tag__picker"
          @select="onSelectEmoji(tag.name, $event)"
          @reset="onResetEmoji(tag.name)"
          @close="openPickerFor = null"
        />
      </div>
    </div>
  </div>
</template>

<style scoped>
.category-tag-list {
  display: flex;
  flex-direction: column;
  gap: 7px;
}
.category-tag-row {
  position: relative;
}
.category-tag {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  background: color-mix(in srgb, var(--primary) 12%, var(--bg-panel));
  border: 1px solid color-mix(in srgb, var(--primary) 30%, transparent);
  border-radius: 999px;
  padding: 4px 8px 4px 4px;
  font-size: 0.75rem;
  font-weight: 600;
  color: color-mix(in srgb, var(--primary) 75%, var(--text-main));
  width: 100%;
}
.category-tag__emoji {
  border: 0;
  background: var(--bg-panel);
  border-radius: 999px;
  min-width: 26px;
  min-height: 26px;
  font-size: 0.95rem;
  line-height: 1;
  cursor: pointer;
}
.category-tag__emoji:hover {
  background: var(--line);
}
.category-tag__name {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.category-tag__order {
  display: inline-flex;
  gap: 2px;
}
.category-tag__order .icon-btn {
  min-width: 20px;
  min-height: 20px;
  font-size: 0.7rem;
}
.category-tag__order .icon-btn:disabled {
  opacity: 0.3;
  cursor: default;
}
.category-tag__picker {
  position: absolute;
  z-index: 20;
  top: calc(100% + 5px);
  left: 0;
}
</style>
