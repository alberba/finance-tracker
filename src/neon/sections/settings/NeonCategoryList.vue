<script setup lang="ts">
import { ref } from 'vue'

import type { CategoryTagViewModel } from '../../../domain/settings/view-model'
import type { CategoryKey } from '../../../scripts/types'
import { useSettingsStore } from '../../../stores/settings'
import NeonButton from '../../ui/NeonButton.vue'
import type { PendingDeletion } from './deletion'
import NeonSettingsField from './NeonSettingsField.vue'

// One list of categories (income, expense or investment) in the order the
// selects show them: each with its emoji, moved up or down, or removed; a new
// one goes at the end.
const props = defineProps<{
  title: string
  /** «de ingresos», for the names of controls. */
  noun: string
  categoryKey: CategoryKey
  tags: CategoryTagViewModel[]
}>()
const emit = defineEmits<{ ask: [deletion: PendingDeletion] }>()

const settingsStore = useSettingsStore()
const name = ref('')
const editing = ref<string | null>(null)
const emoji = ref('')

const ICON_BUTTON =
  'bg-panel2 text-muted outline-accent grid size-9 pointer-coarse:size-11 shrink-0 place-items-center rounded-full focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-40 pointer-fine:hover:text-text motion-safe:transition-transform motion-safe:duration-140 motion-safe:active:scale-[0.96]'

function add(): void {
  if (settingsStore.addCategory(props.categoryKey, name.value)) name.value = ''
}

function edit(tag: CategoryTagViewModel): void {
  editing.value = editing.value === tag.name ? null : tag.name
  emoji.value = tag.emoji
}

function saveEmoji(tag: CategoryTagViewModel): void {
  settingsStore.setCategoryEmoji(props.categoryKey, tag.name, emoji.value)
  editing.value = null
}

function resetEmoji(tag: CategoryTagViewModel): void {
  settingsStore.resetCategoryEmoji(props.categoryKey, tag.name)
  editing.value = null
}

function askDelete(tag: CategoryTagViewModel): void {
  emit('ask', {
    title: '¿Eliminar esta categoría?',
    confirmLabel: 'Eliminar categoría',
    message: `${tag.name}. Los movimientos que ya la usan la conservan.`,
    run: () => settingsStore.removeCategory(props.categoryKey, tag.name),
  })
}
</script>

<template>
  <div class="grid min-w-0 content-start gap-1" :data-category-list="categoryKey">
    <h3
      class="text-muted text-label tracking-label mbe-1.5 flex items-baseline gap-2.5 font-sans font-extrabold uppercase"
    >
      {{ title }}
      <span class="text-meta font-bold tracking-normal normal-case">{{ tags.length }}</span>
    </h3>
    <ol :aria-label="`Categorías ${noun}`" class="grid">
      <li
        v-for="(tag, index) in tags"
        :key="tag.name"
        class="border-line pointer-fine:hover:bg-panel2 min-w-0 border-t py-2.5"
        :data-category="tag.name"
      >
        <div
          class="grid min-h-11 min-w-0 grid-cols-[26px_40px_minmax(0,1fr)_auto] items-center gap-x-3"
        >
          <span class="font-display text-muted text-[13px]">
            {{ String(index + 1).padStart(2, '0') }}
          </span>
          <button
            type="button"
            class="bg-panel2 text-soft outline-accent grid size-10 place-items-center rounded-full text-[18px] focus-visible:outline-2 focus-visible:outline-offset-2 pointer-coarse:size-11"
            :aria-label="`Cambiar icono de ${tag.name}`"
            :aria-expanded="editing === tag.name"
            @click="edit(tag)"
          >
            <span aria-hidden="true">{{ tag.emoji }}</span>
          </button>
          <span class="min-w-0 truncate text-[16px] font-bold">{{ tag.name }}</span>
          <span class="flex gap-0.5">
            <button
              type="button"
              :class="ICON_BUTTON"
              :aria-label="`Subir ${tag.name}`"
              :disabled="index === 0"
              @click="settingsStore.reorderCategory(categoryKey, tag.name, 'up')"
            >
              <svg
                class="size-[18px]"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
                aria-hidden="true"
              >
                <path d="M12 19V5M6 11l6-6 6 6" />
              </svg>
            </button>
            <button
              type="button"
              :class="ICON_BUTTON"
              :aria-label="`Bajar ${tag.name}`"
              :disabled="index === tags.length - 1"
              @click="settingsStore.reorderCategory(categoryKey, tag.name, 'down')"
            >
              <svg
                class="size-[18px]"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
                aria-hidden="true"
              >
                <path d="M12 5v14M6 13l6 6 6-6" />
              </svg>
            </button>
            <button
              type="button"
              :class="[ICON_BUTTON, 'pointer-fine:hover:text-loss']"
              :aria-label="`Eliminar categoría ${tag.name}`"
              @click="askDelete(tag)"
            >
              <svg
                class="size-[18px]"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
                aria-hidden="true"
              >
                <path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13" />
              </svg>
            </button>
          </span>
        </div>
        <div v-if="editing === tag.name" class="flex flex-wrap items-center gap-2 ps-[78px] pbs-2">
          <div class="w-24">
            <NeonSettingsField
              v-model="emoji"
              :label="`Emoji de ${tag.name}`"
              @keydown.enter="saveEmoji(tag)"
            />
          </div>
          <NeonButton @click="saveEmoji(tag)">Guardar icono</NeonButton>
          <NeonButton v-if="tag.isCustomEmoji" @click="resetEmoji(tag)">Restablecer</NeonButton>
        </div>
      </li>
    </ol>
    <div class="border-line grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 border-t pbs-3">
      <NeonSettingsField
        v-model="name"
        :label="`Nueva categoría ${noun}`"
        placeholder="Nueva categoría"
        @keydown.enter="add"
      />
      <NeonButton @click="add">Añadir</NeonButton>
    </div>
  </div>
</template>
