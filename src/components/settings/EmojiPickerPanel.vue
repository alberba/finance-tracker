<script setup lang="ts">
import { ref } from 'vue'

import BaseButton from '../ui/BaseButton.vue'
import BaseInput from '../ui/BaseInput.vue'

// The emoji palette of a category, opened under its emoji: pick one, type
// another, or go back to the default. Eight per row, as the grid shows them.
// prettier-ignore
const EMOJI_PALETTE = [
  '💼', '💰', '💳', '💸', '🏦', '📈', '📉', '📊',
  '🪙', '💵', '🧾', '🎯', '✨', '🎉', '🎁', '🔁',
  '🍽️', '🍔', '☕', '🛒', '🏠', '🚗', '🚌', '✈️',
  '👕', '📺', '🎮', '🏃', '🏥', '💊', '📚', '🐾',
  '👶', '🎓', '🛠️', '📱', '💡', '🌱', '🏢', '₿',
  '🥇', '🥈', '🏷️', '📦', '🧳', '🍿', '🍕', '🎬',
]

const props = defineProps<{
  modelValue: string
  isCustom: boolean
  /** Name of the category, for the dialog's name. */
  category: string
}>()

const emit = defineEmits<{
  select: [emoji: string]
  reset: []
  close: []
}>()

const customEmoji = ref('')

function applyCustom(): void {
  const value = customEmoji.value.trim()
  if (!value) return
  emit('select', value)
  customEmoji.value = ''
}
</script>

<template>
  <div
    class="border-line bg-panel shadow-raised grid w-80 gap-3 rounded-md border p-4"
    role="dialog"
    :aria-label="`Elegir emoji de ${category}`"
  >
    <div class="grid grid-cols-8 gap-1">
      <button
        v-for="emoji in EMOJI_PALETTE"
        :key="emoji"
        type="button"
        class="hover:bg-subtle focus-visible:outline-primary flex h-9 items-center justify-center rounded-sm border text-lg focus-visible:outline-2"
        :class="emoji === props.modelValue ? 'border-primary bg-primary/10' : 'border-transparent'"
        :aria-pressed="emoji === props.modelValue"
        @click="emit('select', emoji)"
      >
        {{ emoji }}
      </button>
    </div>
    <form class="grid grid-cols-[1fr_auto] items-end gap-2" @submit.prevent="applyCustom">
      <BaseInput
        v-model="customEmoji"
        label="Emoji personalizado"
        hide-label
        maxlength="8"
        placeholder="Otro emoji…"
        autocomplete="off"
      />
      <BaseButton type="submit">Usar</BaseButton>
    </form>
    <div class="border-line flex justify-between gap-2 border-t pt-2">
      <BaseButton v-if="props.isCustom" variant="ghost" @click="emit('reset')">
        Restablecer por defecto
      </BaseButton>
      <BaseButton variant="ghost" class="ml-auto" @click="emit('close')">Cerrar</BaseButton>
    </div>
  </div>
</template>
