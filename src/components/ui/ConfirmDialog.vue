<script setup lang="ts">
import { nextTick, onMounted, useId, useTemplateRef, watch } from 'vue'

import BaseButton from './BaseButton.vue'

// A centered confirmation for destructive actions. Focus starts on Cancelar,
// so Enter never deletes by accident; Escape and Cancelar close it, and focus
// goes back to whatever opened it.
defineProps<{
  title: string
  titleId: string
  confirmLabel: string
}>()

const emit = defineEmits<{ confirm: [] }>()

const open = defineModel<boolean>('open', { required: true })
const dialog = useTemplateRef<HTMLDialogElement>('dialog')
const cancelButton = useTemplateRef<InstanceType<typeof BaseButton>>('cancel')
const descriptionId = useId()
let opener: HTMLElement | null = null

function sync(shouldOpen: boolean): void {
  const element = dialog.value
  if (!element) return
  if (shouldOpen && !element.open) {
    opener = document.activeElement instanceof HTMLElement ? document.activeElement : null
    element.showModal?.()
    ;(cancelButton.value?.$el as HTMLElement | undefined)?.focus()
  } else if (!shouldOpen && element.open) {
    element.close()
    opener?.focus()
    opener = null
  }
}

watch(open, (value) => void nextTick(() => sync(value)))
onMounted(() => sync(open.value))

function onCancel(event: Event): void {
  event.preventDefault()
  open.value = false
}

function onConfirm(): void {
  emit('confirm')
  open.value = false
}
</script>

<template>
  <dialog
    ref="dialog"
    role="alertdialog"
    class="confirm-dialog bg-panel text-text-main border-line shadow-raised m-auto w-[calc(100%-2rem)] max-w-md rounded-lg border p-6 sm:p-7"
    :aria-labelledby="titleId"
    :aria-describedby="descriptionId"
    @cancel="onCancel"
  >
    <div class="grid gap-5">
      <div class="grid gap-2">
        <h2 :id="titleId" class="font-display text-xl font-bold tracking-tight">{{ title }}</h2>
        <p :id="descriptionId" class="text-text-muted text-[0.9375rem] leading-relaxed">
          <slot />
        </p>
      </div>
      <div class="flex flex-wrap justify-end gap-2.5">
        <BaseButton ref="cancel" variant="ghost" @click="open = false">Cancelar</BaseButton>
        <BaseButton variant="danger" data-confirm @click="onConfirm">{{ confirmLabel }}</BaseButton>
      </div>
    </div>
  </dialog>
</template>

<style scoped>
.confirm-dialog::backdrop {
  background: var(--overlay);
}
</style>
