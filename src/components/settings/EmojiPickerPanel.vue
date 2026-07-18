<script setup lang="ts">
import { ref } from 'vue'

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
}>()

const emit = defineEmits<{
  select: [emoji: string]
  reset: []
  close: []
}>()

const customEmoji = ref('')

function pick(emoji: string): void {
  emit('select', emoji)
}

function applyCustom(): void {
  const value = customEmoji.value.trim()
  if (!value) {
    return
  }
  emit('select', value)
  customEmoji.value = ''
}
</script>

<template>
  <div class="emoji-picker" role="dialog" aria-label="Elegir emoji">
    <div class="emoji-picker__grid">
      <button
        v-for="emoji in EMOJI_PALETTE"
        :key="emoji"
        type="button"
        class="emoji-picker__option"
        :class="{ 'is-selected': emoji === props.modelValue }"
        @click="pick(emoji)"
      >
        {{ emoji }}
      </button>
    </div>
    <form class="emoji-picker__custom" @submit.prevent="applyCustom">
      <input
        v-model="customEmoji"
        type="text"
        maxlength="8"
        placeholder="Otro emoji…"
        aria-label="Emoji personalizado"
        autocomplete="off"
      />
      <button type="submit" class="secondary-btn">Usar</button>
    </form>
    <div class="emoji-picker__footer">
      <button
        v-if="props.isCustom"
        type="button"
        class="emoji-picker__reset"
        @click="emit('reset')"
      >
        Restablecer por defecto
      </button>
      <button type="button" class="emoji-picker__close" @click="emit('close')">Cerrar</button>
    </div>
  </div>
</template>

<style scoped>
.emoji-picker {
  display: grid;
  gap: 9px;
  padding: 11px;
  border-radius: var(--radius-md);
  background: var(--bg-panel);
  border: 1px solid var(--line);
  box-shadow: 0 10px 24px color-mix(in srgb, #000 14%, transparent);
}
.emoji-picker__grid {
  display: grid;
  grid-template-columns: repeat(8, 1fr);
  gap: 4px;
  max-width: 280px;
}
.emoji-picker__option {
  border: 1px solid transparent;
  background: transparent;
  border-radius: var(--radius-sm);
  font-size: 1.05rem;
  line-height: 1;
  padding: 5px;
  cursor: pointer;
}
.emoji-picker__option:hover {
  background: var(--line);
}
.emoji-picker__option.is-selected {
  border-color: color-mix(in srgb, var(--primary) 45%, transparent);
  background: var(--primary-light);
}
.emoji-picker__custom {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 7px;
}
.emoji-picker__footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 9px;
}
.emoji-picker__reset,
.emoji-picker__close {
  border: 0;
  background: transparent;
  color: var(--text-muted);
  font-size: 0.75rem;
  font-weight: 600;
  cursor: pointer;
  padding: 3px 5px;
}
.emoji-picker__reset:hover,
.emoji-picker__close:hover {
  color: var(--text-main);
  text-decoration: underline;
}
</style>
