<script setup lang="ts">
import { nextTick, onMounted, useTemplateRef, watch } from 'vue'

import IconButton from './IconButton.vue'
import KickerLabel from './KickerLabel.vue'

// Create and edit forms: a modal <dialog> anchored to the right (the whole
// screen on mobile) with a kicker and title, a scrolling body and a footer for
// the actions. Closes with Escape, the close button or whatever the footer
// wires to `open = false`; focus goes back to the opener.
defineProps<{
  kicker: string
  title: string
  titleId: string
}>()

const open = defineModel<boolean>('open', { required: true })
const dialog = useTemplateRef<HTMLDialogElement>('dialog')
const scrollArea = useTemplateRef<HTMLElement>('scrollArea')
let opener: HTMLElement | null = null

function resetScroll(): void {
  if (scrollArea.value) scrollArea.value.scrollTop = 0
}

function sync(shouldOpen: boolean): void {
  const element = dialog.value
  if (!element) return
  if (shouldOpen && !element.open) {
    opener = document.activeElement instanceof HTMLElement ? document.activeElement : null
    element.showModal?.()
    // The closed dialog stays mounted, so every opening starts at the top of
    // the form instead of inheriting the previous scroll position.
    resetScroll()
  } else if (!shouldOpen && element.open) {
    element.close()
    opener?.focus()
    opener = null
  }
}

watch(open, (value) => void nextTick(() => sync(value)))
onMounted(() => sync(open.value))

function onCancel(event: Event): void {
  // Escape: let the model drive the close so state and dialog stay in step.
  event.preventDefault()
  open.value = false
}
</script>

<template>
  <dialog
    ref="dialog"
    class="side-panel bg-panel text-text-main shadow-raised m-0 ml-auto h-dvh max-h-dvh w-full max-w-full p-0 sm:max-w-xl"
    :aria-labelledby="titleId"
    @cancel="onCancel"
  >
    <div class="flex h-full flex-col">
      <header
        class="border-line flex items-start justify-between gap-4 border-b px-5 pt-4 pb-4 sm:px-8 sm:pt-7 sm:pb-5"
      >
        <div class="grid gap-1.5">
          <KickerLabel>{{ kicker }}</KickerLabel>
          <h2 :id="titleId" class="text-text-main font-display text-2xl font-bold tracking-tight">
            {{ title }}
          </h2>
        </div>
        <IconButton label="Cerrar" icon="close" @click="open = false" />
      </header>
      <div
        ref="scrollArea"
        data-side-panel-body
        class="grid flex-1 content-start gap-6 overflow-y-auto px-5 py-5 sm:px-8 sm:py-6"
      >
        <slot />
      </div>
      <footer
        v-if="$slots.footer"
        class="border-line bg-subtle flex flex-wrap justify-end gap-2.5 border-t px-5 py-4 sm:px-8"
      >
        <slot name="footer" />
      </footer>
    </div>
  </dialog>
</template>

<style scoped>
.side-panel::backdrop {
  background: var(--overlay);
}

@media (prefers-reduced-motion: no-preference) {
  .side-panel[open] {
    animation: side-panel-in 0.22s ease-out;
  }
}

@keyframes side-panel-in {
  from {
    transform: translateX(24px);
    opacity: 0;
  }
}
</style>
