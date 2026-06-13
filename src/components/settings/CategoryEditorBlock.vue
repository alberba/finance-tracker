<script setup lang="ts">
import { ref } from 'vue'

import type { CategoryTagViewModel } from '../../domain/settings/view-model'
import type { CategoryKey } from '../../scripts/types'
import { useSettingsStore } from '../../stores/settings'

const props = defineProps<{
  title: string
  categoryKey: CategoryKey
  formId: string
  listId: string
  tags: CategoryTagViewModel[]
}>()

const settingsStore = useSettingsStore()
const name = ref('')

function onAdd(): void {
  if (settingsStore.addCategory(props.categoryKey, name.value)) {
    name.value = ''
  }
}
</script>

<template>
  <div class="category-block">
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
    <div :id="listId" class="tag-wrap">
      <small v-if="!tags.length">Sin categorías.</small>
      <span v-for="tag in tags" v-else :key="tag.name" class="tag">
        {{ tag.label }}
        <button
          class="icon-btn"
          type="button"
          :aria-label="`Eliminar categoría ${tag.name}`"
          @click="settingsStore.removeCategory(categoryKey, tag.name)"
        >
          ×
        </button>
      </span>
    </div>
  </div>
</template>
