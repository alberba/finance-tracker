<script setup lang="ts">
import { nextTick, onBeforeUnmount, ref, useTemplateRef, watch } from 'vue'

// The detail of a row on the desktop: a popover beside the card the row is in
// (DESIGN.md, Popover junto a una fila), with no scrim, so the list stays in
// view and usable. It sits past the card's end edge at the row's height, its
// arrow on the row; with no room there it goes before the card, and on a
// narrow page it keeps to the end edge. It is placed in its nearest positioned
// ancestor. Another row moves it there; Escape, its button or a press outside
// close it, and the focus goes back to the row. A press on a row (`rows`) is
// the row's to handle: the same one closes it, another one moves it.
const props = defineProps<{
  title: string
  kicker?: string
  /** The row it belongs to. */
  anchor: HTMLElement | null
  /** Selector of the rows that open it. */
  rows: string
}>()

const emit = defineEmits<{ opened: [] }>()
const open = defineModel<boolean>('open', { required: true })

const GAP = 14
const LIFT = 20

const root = useTemplateRef<HTMLElement>('root')
const place = ref({ left: 0, top: 0, arrow: 24, before: false })
// It glides from row to row, but appears in its place: no glide from 0, 0.
const placed = ref(false)

function container(): HTMLElement | null {
  const parent = root.value?.offsetParent
  return parent instanceof HTMLElement ? parent : null
}

function position(): void {
  const { anchor } = props
  const box = container()
  if (!anchor || !box || !root.value) return
  // The page may be zoomed (the root's density zoom): measured boxes come in
  // screen pixels, the popover is placed in CSS pixels.
  const rect = box.getBoundingClientRect()
  const zoom = rect.width / box.offsetWidth || 1
  const local = (el: Element) => {
    const r = el.getBoundingClientRect()
    return {
      left: (r.left - rect.left) / zoom,
      right: (r.right - rect.left) / zoom,
      top: (r.top - rect.top) / zoom,
      bottom: (r.bottom - rect.top) / zoom,
    }
  }
  const row = local(anchor)
  const card = local(anchor.closest('section') ?? anchor)
  const { offsetWidth: width, offsetHeight: height } = root.value
  const after = card.right + GAP
  const before = card.left - GAP - width
  const goesBefore = after + width > box.offsetWidth && before >= 0
  const left = goesBefore ? before : Math.max(0, Math.min(after, box.offsetWidth - width))
  // At the row's height, but inside the box when the row is near its bottom.
  const top = Math.max(0, Math.min(row.top - LIFT, box.offsetHeight - height))
  place.value = { left, top, arrow: row.top - top + (row.bottom - row.top) / 2, before: goesBefore }
}

let resize: ResizeObserver | null = null

function onPointerDown(event: Event): void {
  const target = event.target
  if (!(target instanceof Element)) return
  if (root.value?.contains(target) || target.closest(props.rows)) return
  open.value = false
}

function onKeyDown(event: KeyboardEvent): void {
  if (event.key !== 'Escape') return
  event.preventDefault()
  close()
}

function close(): void {
  const row = props.anchor
  open.value = false
  void nextTick(() => row?.focus())
}

function stop(): void {
  document.removeEventListener('pointerdown', onPointerDown)
  document.removeEventListener('keydown', onKeyDown)
  resize?.disconnect()
  resize = null
}

watch(
  () => [open.value, props.anchor] as const,
  async ([isOpen]) => {
    if (!isOpen) return stop()
    if (!resize) placed.value = false
    await nextTick()
    position()
    await nextTick()
    // Whole in view: a row near the window's bottom brings it up.
    root.value?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
    emit('opened')
    requestAnimationFrame(() => (placed.value = true))
    if (resize) return
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    resize = new ResizeObserver(position)
    const box = container()
    if (box) resize.observe(box)
  },
  { immediate: true },
)

onBeforeUnmount(stop)
</script>

<template>
  <div
    v-if="open"
    ref="root"
    role="dialog"
    :aria-label="title"
    class="bg-panel border-line rounded-popover shadow-float motion-safe:animate-pop-side absolute z-40 grid w-[min(400px,calc(100%-24px))] scroll-my-8 gap-4 border px-[22px] pbs-5 pbe-4"
    :class="[
      place.before && 'motion-safe:[--pop-side-x:12px]',
      placed &&
        'motion-safe:transition-[inset-block-start,inset-inline-start] motion-safe:duration-200 motion-safe:ease-out',
    ]"
    :style="{
      insetInlineStart: `${place.left}px`,
      insetBlockStart: `${place.top}px`,
      transformOrigin: `${place.before ? '100%' : '0'} ${place.arrow}px`,
    }"
  >
    <span
      class="bg-panel border-line pointer-events-none absolute size-3 rotate-45"
      :class="
        place.before ? 'inset-e-[-7px] border-e border-t' : 'inset-s-[-7px] border-s border-b'
      "
      :style="{ insetBlockStart: `${place.arrow - 6}px` }"
      aria-hidden="true"
    ></span>
    <div class="flex items-start justify-between gap-4">
      <div class="grid min-w-0 gap-0.5">
        <p v-if="kicker" class="text-muted text-meta">{{ kicker }}</p>
        <h2 class="text-[18px] font-extrabold">{{ title }}</h2>
      </div>
      <button
        type="button"
        class="border-ctrl-line text-soft outline-accent grid size-9 shrink-0 place-items-center rounded-full border focus-visible:outline-2 focus-visible:outline-offset-2 motion-safe:transition-transform motion-safe:duration-140 motion-safe:ease-out motion-safe:active:scale-[0.96]"
        aria-label="Cerrar"
        @click="close"
      >
        <svg
          class="size-4"
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
    <slot />
  </div>
</template>
