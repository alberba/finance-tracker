<script setup lang="ts">
import BaseButton from '../ui/BaseButton.vue'
import { useSetupNavigation } from '../../composables/useSetupNavigation'

const props = withDefaults(
  defineProps<{
    message: string
    action?: string
    target?: 'accounts' | 'categories'
  }>(),
  { action: 'Crear cuenta', target: 'accounts' },
)

const emit = defineEmits<{ resolve: [] }>()

const { createAccount, editCategories } = useSetupNavigation()

function resolveRequirement(): void {
  emit('resolve')
  if (props.target === 'categories') editCategories()
  else createAccount()
}
</script>

<template>
  <div
    role="status"
    class="border-line bg-panel flex flex-wrap items-center justify-between gap-4 rounded-md border p-4"
    data-setup-requirement
  >
    <p class="text-text-muted text-sm">{{ message }}</p>
    <BaseButton class="active:opacity-80" @click="resolveRequirement">{{ action }}</BaseButton>
  </div>
</template>
