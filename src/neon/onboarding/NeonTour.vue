<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, useTemplateRef, watch } from 'vue'

import { useUiStore } from '../../stores/ui'
import NeonButton from '../ui/NeonButton.vue'
import { TOUR_STEPS, type TourStep } from './tour-steps'
import { useTour, useTourAutoOpen, type TourPlatform } from './use-tour'

// The guided tour (#527, DESIGN.md «Recorrido guiado»): a bubble beside the
// real control, the rest of the page under the scrim with that control cut
// out of it. It points without navigating; a step whose control is not on
// screen is skipped. Escape skips the whole tour, the arrows move through it,
// and the focus goes to each bubble. Mounted once, by the workspace.
const uiStore = useUiStore()
const tour = useTour()
const { settled } = useTourAutoOpen()
// For whoever waits on it (the E2E): `waiting` until it is decided.
const state = computed(() => (uiStore.tourOpen ? 'open' : settled.value ? 'idle' : 'waiting'))

/** Around the lit control. */
const PAD = 6
/** Between the lit control and the bubble. */
const GAP = 14
/** Between the bubble and the window's edge. */
const EDGE = 12
/** How long a step waits for its control to render before it is skipped. */
const WAIT = 1200

const layer = useTemplateRef<HTMLElement>('layer')
const bubble = useTemplateRef<HTMLElement>('bubble')

/** The frame the running tour belongs to. */
const running = ref<TourPlatform | null>(null)
const steps = computed(() => (running.value ? TOUR_STEPS[running.value] : []))
const index = ref(0)
const step = computed<TourStep | undefined>(() => steps.value[index.value])
const last = computed(() => index.value === steps.value.length - 1)
const spot = ref({ left: 0, top: 0, width: 0, height: 0, radius: 0 })
const place = ref({ left: 0, top: 0, arrow: 0, side: 'bottom' as TourStep['side'] })
// It appears in its place, and only glides from one control to the next.
// Hidden by opacity, not visibility, so the first bubble can take the focus
// in the same tick it is placed.
const shown = ref(false)
const placed = ref(false)

let anchors: HTMLElement[] = []
let run = 0
let returnFocus: HTMLElement | null = null

function visible(selector: string): HTMLElement[] {
  return [...document.querySelectorAll<HTMLElement>(selector)].filter(
    (el) => el.getClientRects().length > 0 && getComputedStyle(el).visibility !== 'hidden',
  )
}

function waitFor(selector: string, current: number): Promise<HTMLElement[]> {
  const until = performance.now() + WAIT
  return new Promise((resolve) => {
    const check = () => {
      const found = visible(selector)
      if (found.length || current !== run || performance.now() > until) return resolve(found)
      requestAnimationFrame(check)
    }
    check()
  })
}

/** Shows the first step from `from` on, going `dir`, whose control is on screen. */
async function go(from: number, dir: 1 | -1): Promise<void> {
  const current = ++run
  for (let i = from; i >= 0 && i < steps.value.length; i += dir) {
    const found = await waitFor(steps.value[i].target, current)
    if (current !== run) return
    if (!found.length) continue
    anchors = found
    index.value = i
    found[0].scrollIntoView({ block: 'nearest' })
    await nextTick()
    measure()
    shown.value = true
    await nextTick()
    bubble.value?.focus({ preventScroll: true })
    requestAnimationFrame(() => (placed.value = true))
    return
  }
  if (dir === 1) finish()
}

function measure(): void {
  const box = layer.value
  const card = bubble.value
  if (!box || !card || !anchors.length || !step.value) return
  // The page may be zoomed (the root's density zoom): measured boxes come in
  // screen pixels, the layer is laid out in CSS pixels.
  const frame = box.getBoundingClientRect()
  const zoom = frame.width / box.offsetWidth || 1
  const rects = anchors.map((el) => el.getBoundingClientRect())
  const left = (Math.min(...rects.map((r) => r.left)) - frame.left) / zoom
  const top = (Math.min(...rects.map((r) => r.top)) - frame.top) / zoom
  const right = (Math.max(...rects.map((r) => r.right)) - frame.left) / zoom
  const bottom = (Math.max(...rects.map((r) => r.bottom)) - frame.top) / zoom
  const corner = parseFloat(getComputedStyle(anchors[0]).borderTopLeftRadius) || 0
  spot.value = {
    left: left - PAD,
    top: top - PAD,
    width: right - left + PAD * 2,
    height: bottom - top + PAD * 2,
    radius: Math.min(corner, (bottom - top) / 2, (right - left) / 2) + PAD,
  }

  const { offsetWidth: width, offsetHeight: height } = card
  const W = box.offsetWidth
  const H = box.offsetHeight
  const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(value, max))
  const x = (left + right) / 2
  const y = (top + bottom) / 2
  const across = clamp(x - width / 2, EDGE, W - width - EDGE)
  const below = bottom + PAD + GAP
  const above = top - PAD - GAP - height
  let side = step.value.side
  if (side === 'end' && right + PAD + GAP + width > W - EDGE) side = 'bottom'
  if (side === 'bottom' && below + height > H - EDGE) side = 'top'
  if (side === 'top' && above < EDGE) side = 'bottom'
  if (side === 'end') {
    const at = clamp(y - 32, EDGE, H - height - EDGE)
    place.value = { side, left: right + PAD + GAP, top: at, arrow: clamp(y - at, 20, height - 20) }
  } else {
    place.value = {
      side,
      left: across,
      top: side === 'bottom' ? below : above,
      arrow: clamp(x - across, 24, width - 24),
    }
  }
}

let frame = 0
function remeasure(): void {
  cancelAnimationFrame(frame)
  frame = requestAnimationFrame(measure)
}

const next = () => (last.value ? finish() : void go(index.value + 1, 1))
const back = () => index.value > 0 && void go(index.value - 1, -1)

function finish(): void {
  if (running.value) tour.finish(running.value)
}

function onKeyDown(event: KeyboardEvent): void {
  if (event.key === 'Escape') {
    event.preventDefault()
    event.stopPropagation()
    finish()
  } else if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
    event.preventDefault()
    if (event.key === 'ArrowRight') next()
    else back()
  } else if (event.key === 'Tab') {
    // The page is under the scrim: the focus stays in the bubble.
    const focusable = [...(bubble.value?.querySelectorAll<HTMLElement>('button') ?? [])]
    if (!focusable.length) return
    const first = focusable[0]
    const end = focusable[focusable.length - 1]
    const at = document.activeElement
    if (event.shiftKey && (at === first || at === bubble.value)) {
      event.preventDefault()
      end.focus()
    } else if (!event.shiftKey && at === end) {
      event.preventDefault()
      first.focus()
    }
  }
}

let resize: ResizeObserver | null = null

function stop(): void {
  run++
  cancelAnimationFrame(frame)
  document.removeEventListener('keydown', onKeyDown, true)
  window.removeEventListener('resize', remeasure)
  window.removeEventListener('scroll', remeasure, true)
  resize?.disconnect()
  resize = null
  anchors = []
}

watch(
  () => uiStore.tourOpen,
  async (open) => {
    if (!open) {
      stop()
      running.value = null
      shown.value = false
      placed.value = false
      if (returnFocus?.isConnected) returnFocus.focus({ preventScroll: true })
      returnFocus = null
      return
    }
    returnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null
    running.value = tour.platform.value
    index.value = 0
    await nextTick()
    document.addEventListener('keydown', onKeyDown, true)
    window.addEventListener('resize', remeasure)
    window.addEventListener('scroll', remeasure, true)
    resize = new ResizeObserver(remeasure)
    if (bubble.value) resize.observe(bubble.value)
    // The wizard's modal dialog closes on its own tick; while it is open the
    // page is inert and the bubble could not take the focus.
    const current = run
    while (document.querySelector('dialog[open]:modal') && current === run) {
      await new Promise(requestAnimationFrame)
    }
    if (current === run) void go(0, 1)
  },
  { immediate: true },
)

// Past the frame breakpoint the controls it points at are another frame's:
// it closes, and that frame's tour is still to be seen.
watch(tour.platform, (now) => {
  if (running.value && now !== running.value) tour.abandon()
})

onBeforeUnmount(stop)
</script>

<template>
  <Teleport to="body">
    <div
      v-if="running"
      ref="layer"
      class="fixed inset-0 z-60"
      :data-tour="running"
      :data-tour-step="step ? index + 1 : undefined"
    >
      <div
        class="pointer-events-none absolute shadow-[0_0_0_200vmax_oklch(0%_none_none/0.62)]"
        :class="[
          !shown && 'opacity-0',
          placed &&
            'motion-safe:transition-[inset-inline-start,inset-block-start,width,height,border-radius] motion-safe:duration-260 motion-safe:ease-[cubic-bezier(0.22,1,0.36,1)]',
        ]"
        :style="{
          insetInlineStart: `${spot.left}px`,
          insetBlockStart: `${spot.top}px`,
          width: `${spot.width}px`,
          height: `${spot.height}px`,
          borderRadius: `${spot.radius}px`,
        }"
        aria-hidden="true"
      ></div>
      <div
        ref="bubble"
        role="dialog"
        aria-modal="true"
        aria-labelledby="tour-title"
        aria-describedby="tour-text"
        tabindex="-1"
        class="bg-panel border-line rounded-popover shadow-float absolute grid w-[min(360px,calc(100%-24px))] gap-2.5 border px-[22px] pbs-5 pbe-4 outline-none"
        :class="[
          !shown && 'opacity-0',
          placed &&
            'motion-safe:transition-[inset-inline-start,inset-block-start] motion-safe:duration-260 motion-safe:ease-[cubic-bezier(0.22,1,0.36,1)]',
        ]"
        :style="{ insetInlineStart: `${place.left}px`, insetBlockStart: `${place.top}px` }"
      >
        <span
          class="bg-panel border-line pointer-events-none absolute size-3.5 rotate-45"
          :class="{
            'inset-s-[-7px] border-s border-b': place.side === 'end',
            'inset-bs-[-7px] border-s border-t': place.side === 'bottom',
            'inset-be-[-7px] border-e border-b': place.side === 'top',
          }"
          :style="
            place.side === 'end'
              ? { insetBlockStart: `${place.arrow - 6}px` }
              : { insetInlineStart: `${place.arrow - 6}px` }
          "
          aria-hidden="true"
        ></span>
        <div class="flex items-center justify-between gap-3">
          <p
            class="text-muted text-label tracking-label font-extrabold uppercase tabular-nums"
            data-tour-count
          >
            {{ index + 1 }} de {{ steps.length }}
          </p>
          <button
            type="button"
            class="bg-panel2 text-soft hover:text-text outline-accent grid size-9 shrink-0 place-items-center rounded-full focus-visible:outline-2 focus-visible:outline-offset-2 motion-safe:transition-transform motion-safe:duration-140 motion-safe:ease-out motion-safe:active:scale-[0.96]"
            aria-label="Saltar el recorrido"
            data-tour-skip
            @click="finish"
          >
            <svg
              class="size-4.5"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              aria-hidden="true"
            >
              <path d="M6 6l12 12M18 6 6 18" />
            </svg>
          </button>
        </div>
        <template v-if="step">
          <h2 id="tour-title" class="text-[18px] font-extrabold">{{ step.title }}</h2>
          <p id="tour-text" class="text-soft text-[15px] leading-[1.45] text-pretty">
            {{ step.text }}
          </p>
        </template>
        <div class="mbs-1.5 flex items-center justify-between gap-2">
          <NeonButton v-if="index > 0" class="px-0!" data-tour-back @click="back">Atrás</NeonButton>
          <span v-else aria-hidden="true"></span>
          <NeonButton variant="primary" data-tour-next @click="next">
            {{ last ? 'Terminar' : 'Siguiente' }}
          </NeonButton>
        </div>
      </div>
    </div>
  </Teleport>
  <span hidden :data-tour-state="state"></span>
</template>
