<script setup lang="ts">
import { nextTick, onMounted, useId, useTemplateRef, watch } from 'vue'

import NeonButton from './NeonButton.vue'

// Confirmation of a destructive action in the new design: a small modal
// <dialog> with the consequence in the default slot, «Cancelar» and the
// action in --color-loss. Escape and a press on the scrim cancel; focus goes
// back to what opened it.
defineProps<{
  title: string
  confirmLabel: string
}>()

const open = defineModel<boolean>('open', { required: true })
const emit = defineEmits<{ confirm: [] }>()

const dialog = useTemplateRef<HTMLDialogElement>('dialog')
const titleId = useId()
let opener: HTMLElement | null = null

function sync(shouldOpen: boolean): void {
  const element = dialog.value
  if (!element) return
  if (shouldOpen && !element.open) {
    opener = document.activeElement instanceof HTMLElement ? document.activeElement : null
    element.showModal?.()
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

function onScrimClick(event: MouseEvent): void {
  if (event.target === dialog.value) open.value = false
}

function confirm(): void {
  open.value = false
  emit('confirm')
}
</script>

<template>
  <dialog
    ref="dialog"
    role="alertdialog"
    class="bg-panel text-text border-line rounded-popover shadow-float m-auto w-[min(420px,calc(100vw-32px))] border p-5 backdrop:bg-[oklch(0%_none_none/0.55)]"
    :aria-labelledby="titleId"
    @cancel="onCancel"
    @click="onScrimClick"
  >
    <div class="grid gap-3">
      <h2 :id="titleId" class="text-block-title font-extrabold">{{ title }}</h2>
      <p class="text-soft text-note"><slot /></p>
      <div class="flex flex-wrap justify-end gap-2.5 pbs-2">
        <NeonButton @click="open = false">Cancelar</NeonButton>
        <NeonButton danger @click="confirm">{{ confirmLabel }}</NeonButton>
      </div>
    </div>
  </dialog>
</template>
