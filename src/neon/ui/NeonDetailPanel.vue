<script setup lang="ts">
import { nextTick, onMounted, useTemplateRef, watch } from 'vue'

import {
  dragOffset,
  FLICK_WINDOW_MS,
  FRAME_QUERY,
  releaseVelocity,
  shouldCloseSheet,
} from './sheet-drag'

// Detail panel of the new design (DESIGN.md, Panel de detalle): the detail or
// edit view of one element of a section. A modal <dialog>: a full-height side
// panel on the desktop frame, a bottom sheet below it. It closes with its
// button, Escape, the scrim and, as a sheet, by dragging the grip or the
// header; focus goes back to what opened it. Every detail panel is the same
// size, whatever the section.
const props = defineProps<{
  title: string
  /** Small label over the title («Pendiente»). */
  kicker?: string
  /**
   * Where the focus goes back on close, when it is not what had it on open:
   * a panel opened from another one (a list sheet) would hand it to a row
   * that is already gone.
   */
  returnFocus?: HTMLElement | null
}>()

const open = defineModel<boolean>('open', { required: true })

const EXIT_MS = 200
const RETURN_MS = 320
const EASE_OUT = 'cubic-bezier(0.23, 1, 0.32, 1)'
const EASE_DRAWER = 'cubic-bezier(0.32, 0.72, 0, 1)'

const dialog = useTemplateRef<HTMLDialogElement>('dialog')
const scrollArea = useTemplateRef<HTMLElement>('scrollArea')
let opener: HTMLElement | null = null

function isSheetLayout(): boolean {
  return !window.matchMedia?.(FRAME_QUERY).matches
}

function prefersReducedMotion(): boolean {
  return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false
}

/** Slides the panel (and its scrim) out through where it came in, then resolves. */
async function animateOut(element: HTMLDialogElement): Promise<void> {
  if (typeof element.animate !== 'function' || prefersReducedMotion()) return
  const options = { duration: EXIT_MS, easing: EASE_OUT }
  const keyframes = { opacity: [1, 0] }
  try {
    element.animate(keyframes, { ...options, pseudoElement: '::backdrop' })
    // From where a drag left it (inline transform), or from its place.
    const from = element.style.transform || 'translateY(0)'
    await element.animate({ transform: [from, 'translateY(48px)'], opacity: [1, 0] }, options)
      .finished
  } catch {
    // An interrupted animation (the panel opened again) is not an error.
  }
}

async function sync(shouldOpen: boolean): Promise<void> {
  const element = dialog.value
  if (!element) return
  if (shouldOpen && !element.open) {
    opener =
      props.returnFocus ??
      (document.activeElement instanceof HTMLElement ? document.activeElement : null)
    element.style.transform = ''
    element.showModal?.()
    if (scrollArea.value) scrollArea.value.scrollTop = 0
  } else if (!shouldOpen && element.open) {
    await animateOut(element)
    if (open.value) return
    element.close()
    element.style.transform = ''
    opener?.focus()
    opener = null
  }
}

watch(open, (value) => void nextTick(() => sync(value)))
onMounted(() => void sync(open.value))

function onCancel(event: Event): void {
  // Escape: the model drives the close so the state and the dialog stay in step.
  event.preventDefault()
  open.value = false
}

function onScrimClick(event: MouseEvent): void {
  if (event.target === dialog.value) open.value = false
}

// Dragging the grip and the header, as a bottom sheet only.
let dragStart: { y: number; at: number } | null = null
let lastSample: { y: number; at: number } | null = null
let previousSample: { y: number; at: number } | null = null

function onDragStart(event: PointerEvent): void {
  if (!isSheetLayout() || (event.target as Element).closest('button')) return
  dragStart = { y: event.clientY, at: event.timeStamp }
  previousSample = lastSample = dragStart
  if (dialog.value) dialog.value.style.transition = 'none'
  ;(event.currentTarget as Element).setPointerCapture?.(event.pointerId)
}

function onDragMove(event: PointerEvent): void {
  if (!dragStart || !dialog.value) return
  previousSample = lastSample
  lastSample = { y: event.clientY, at: event.timeStamp }
  dialog.value.style.transform = `translateY(${dragOffset(event.clientY - dragStart.y)}px)`
}

function onDragEnd(event: PointerEvent): void {
  const element = dialog.value
  if (!dragStart || !element || !previousSample || !lastSample) return
  const offset = Math.max(dragOffset(event.clientY - dragStart.y), 0)
  // A finger that stopped before lifting is not a flick: only the last, fresh
  // segment counts. A cancelled gesture (the system took it) never closes.
  const fresh = event.timeStamp - lastSample.at <= FLICK_WINDOW_MS
  const velocity = fresh ? releaseVelocity(previousSample, lastSample) : 0
  const close =
    event.type !== 'pointercancel' &&
    shouldCloseSheet(offset, element.getBoundingClientRect().height, velocity)
  dragStart = lastSample = previousSample = null
  if (close) {
    element.style.transition = ''
    open.value = false
    return
  }
  element.style.transition = `transform ${RETURN_MS}ms ${EASE_DRAWER}`
  element.style.transform = ''
}
</script>

<template>
  <dialog
    ref="dialog"
    class="bg-panel text-text rounded-t-sheet shadow-sheet frame:m-0 frame:ms-auto frame:h-dvh frame:max-h-dvh frame:w-[min(460px,100%)] frame:max-w-none frame:rounded-none frame:border-s frame:border-line frame:shadow-float motion-safe:open:animate-sheet-in motion-safe:backdrop:animate-fade-in mx-auto mbs-auto mbe-0 max-h-[88%] w-full max-w-140 overflow-hidden p-0 backdrop:bg-[oklch(0%_none_none/0.55)] open:flex open:flex-col"
    :aria-label="title"
    @cancel="onCancel"
    @click="onScrimClick"
  >
    <div class="frame:h-full flex max-h-[inherit] min-h-0 flex-col">
      <div
        class="frame:cursor-auto frame:px-6 frame:pbs-6 touch-none px-4 pbs-2.5"
        data-sheet-handle
        @pointerdown="onDragStart"
        @pointermove="onDragMove"
        @pointerup="onDragEnd"
        @pointercancel="onDragEnd"
      >
        <div
          class="bg-ctrl-line frame:hidden rounded-pill mx-auto mbe-3.5 h-1 w-9"
          aria-hidden="true"
        ></div>
        <header class="flex items-start justify-between gap-4 pbe-3">
          <div class="grid min-w-0 gap-1.5">
            <p v-if="kicker" class="text-muted text-label tracking-label font-extrabold uppercase">
              {{ kicker }}
            </p>
            <h2
              class="font-display text-h1-detail tracking-h1 leading-[1.15] font-bold break-words"
            >
              {{ title }}
            </h2>
          </div>
          <button
            type="button"
            class="border-ctrl-line text-soft outline-accent grid size-11 shrink-0 place-items-center rounded-full border focus-visible:outline-2 focus-visible:outline-offset-2 motion-safe:transition-transform motion-safe:duration-140 motion-safe:ease-out motion-safe:active:scale-[0.97]"
            aria-label="Cerrar"
            @click="open = false"
          >
            <svg
              class="size-5"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
              aria-hidden="true"
            >
              <path d="M6 6l12 12M18 6 6 18" />
            </svg>
          </button>
        </header>
      </div>
      <div
        ref="scrollArea"
        class="frame:px-6 grid min-h-0 flex-1 content-start gap-5 overflow-y-auto overscroll-contain px-4 pbe-4"
        data-detail-body
      >
        <slot />
      </div>
      <footer
        v-if="$slots.footer"
        class="border-line frame:px-6 frame:pbe-5 flex flex-wrap justify-end gap-2.5 border-t px-4 pbs-3.5 pbe-[calc(22px+env(safe-area-inset-bottom,0px))]"
      >
        <slot name="footer" />
      </footer>
    </div>
  </dialog>
</template>
