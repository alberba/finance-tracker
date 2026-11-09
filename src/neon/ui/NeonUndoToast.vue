<script setup lang="ts">
import { nextTick, onBeforeUnmount, useTemplateRef, watch } from 'vue'

// «Aviso con deshacer» (DESIGN.md): confirms what was just done and offers to
// revert it for 4s. Inverted box (text on the canvas color), «Deshacer» on the
// right. A manual popover, so it sits in the top layer above an open panel.
// `open` drops back to false when the time runs out, after «Deshacer» or when
// a new message replaces this one (the parent sets it again).
const props = defineProps<{ message: string }>()
const open = defineModel<boolean>('open', { required: true })
const emit = defineEmits<{ undo: [] }>()

const VISIBLE_MS = 4000

const toast = useTemplateRef<HTMLElement>('toast')
let timer: ReturnType<typeof setTimeout> | undefined

function reducedMotion(): boolean {
  return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false
}

function show(element: HTMLElement): void {
  if (typeof element.showPopover === 'function') {
    if (element.matches(':popover-open')) element.hidePopover()
    element.showPopover()
  }
  if (typeof element.animate === 'function' && !reducedMotion()) {
    element.animate(
      { opacity: [0, 1], transform: ['translateY(16px)', 'translateY(0)'] },
      { duration: 260, easing: 'cubic-bezier(0.23, 1, 0.32, 1)' },
    )
  }
  clearTimeout(timer)
  timer = setTimeout(() => (open.value = false), VISIBLE_MS)
}

function hide(element: HTMLElement): void {
  clearTimeout(timer)
  if (typeof element.hidePopover === 'function' && element.matches(':popover-open')) {
    element.hidePopover()
  }
}

watch(
  [open, () => props.message],
  ([value]) =>
    void nextTick(() => {
      const element = toast.value
      if (!element) return
      if (value) show(element)
      else hide(element)
    }),
)

onBeforeUnmount(() => clearTimeout(timer))

function undo(): void {
  emit('undo')
  open.value = false
}
</script>

<template>
  <div
    ref="toast"
    popover="manual"
    role="status"
    class="neon-undo bg-text text-bg rounded-field frame:inset-x-auto frame:inset-e-24 frame:inset-be-6 frame:w-[min(420px,calc(100vw-120px))] fixed inset-x-4 inset-bs-auto inset-be-[118px] m-0 hidden min-h-[52px] items-center justify-between gap-3 border-0 ps-4.5 pe-1.5 text-[15px] font-bold open:flex"
    data-undo-toast
  >
    <span class="min-w-0">{{ message }}</span>
    <button
      type="button"
      class="neon-undo-action outline-bg rounded-pill min-h-11 shrink-0 px-3.5 text-[15px] font-extrabold focus-visible:outline-2 focus-visible:outline-offset-2"
      @click="undo"
    >
      Deshacer
    </button>
  </div>
</template>

<style scoped>
.neon-undo {
  box-shadow: 0 12px 30px -10px oklch(0% 0 none / 0.6);
}

.neon-undo-action {
  color: color-mix(in oklch, var(--color-accent), black 30%);
}
</style>
