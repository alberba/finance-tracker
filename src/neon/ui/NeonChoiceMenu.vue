<script setup lang="ts" generic="T extends string | number">
import { nextTick, onBeforeUnmount, ref, useId, useTemplateRef, watch } from 'vue'

// A pill that opens a short list of exclusive options (DESIGN.md, Popover):
// «Rentabilidad simple», «Periodo · Marzo», «Peso · mayor a menor». Each group
// is one choice; a menu can hold more than one (what to sort by, and which
// way). Picking an option applies it and closes the menu; so do a press
// outside and Escape, which also gives the focus back to the pill.
export interface ChoiceOption<V> {
  value: V
  label: string
  /** A line under the label that says what the option means. */
  hint?: string
  /** A figure beside the label, what the option gives today («+2,7 %»). */
  figure?: string
  /** Classes of the figure, its tone. */
  figureClass?: string
}

export interface ChoiceGroup<V> {
  key: string
  options: ReadonlyArray<ChoiceOption<V>>
  value: V
}

withDefaults(
  defineProps<{
    /** What the pill says: the current choice. */
    text: string
    /**
     * A shorter text for a narrow pill («Marzo» for «Periodo · Marzo»): it is
     * what shows, and `text` stays the accessible name.
     */
    shortText?: string
    /**
     * Align to the pill's edge, open above the center of its positioned row, or
     * below the start of it (`row-start`: a link inside a line of text).
     */
    placement?: 'start' | 'end' | 'above-center' | 'row-start'
    /** Accessible name of the list («Cómo medir la rentabilidad»). */
    label: string
    /** `d` of the pill's 24×24 icon. */
    icon?: string
    groups: ReadonlyArray<ChoiceGroup<T>>
    /**
     * `link` draws the trigger as underlined text with a chevron, inside a line
     * of text («frente al IBEX 35 ▾»); its color comes from the caller.
     */
    look?: 'pill' | 'link'
  }>(),
  { shortText: undefined, placement: 'end', icon: undefined, look: 'pill' },
)

const emit = defineEmits<{ select: [key: string, value: T] }>()

const open = ref(false)
const root = useTemplateRef<HTMLElement>('root')
const trigger = useTemplateRef<HTMLButtonElement>('trigger')
const menu = useTemplateRef<HTMLElement>('menu')
const menuId = useId()

function close(returnFocus = false): void {
  open.value = false
  if (returnFocus) void nextTick(() => trigger.value?.focus({ preventScroll: true }))
}

function pick(key: string, value: T): void {
  emit('select', key, value)
  close(true)
}

function onPointerDown(event: Event): void {
  if (event.target instanceof Node && root.value?.contains(event.target)) return
  close()
}

function onKeyDown(event: KeyboardEvent): void {
  if (event.key === 'Escape') close(true)
}

function focusOption(option: HTMLElement): void {
  option.focus({ preventScroll: true })
  const list = menu.value
  if (!list || list.scrollHeight <= list.clientHeight) return
  const item = option.getBoundingClientRect()
  const viewport = list.getBoundingClientRect()
  list.scrollTop += item.top - viewport.top + (item.height - viewport.height) / 2
}

function onMenuKey(event: KeyboardEvent): void {
  const options = [...(menu.value?.querySelectorAll<HTMLElement>('[role="menuitemradio"]') ?? [])]
  if (!options.length) return
  const current = options.indexOf(event.target as HTMLElement)
  let index: number
  switch (event.key) {
    case 'ArrowDown':
      index = (current + 1) % options.length
      break
    case 'ArrowUp':
      index = (current - 1 + options.length) % options.length
      break
    case 'Home':
      index = 0
      break
    case 'End':
      index = options.length - 1
      break
    default:
      return
  }
  event.preventDefault()
  focusOption(options[index])
}

function onFocusOut(event: FocusEvent): void {
  if (event.relatedTarget instanceof Node && !root.value?.contains(event.relatedTarget)) close()
}

function stopListening(): void {
  document.removeEventListener('pointerdown', onPointerDown)
  document.removeEventListener('keydown', onKeyDown)
}

watch(open, (isOpen) => {
  if (!isOpen) return stopListening()
  document.addEventListener('pointerdown', onPointerDown)
  document.addEventListener('keydown', onKeyDown)
  void nextTick(() => {
    const option = menu.value?.querySelector<HTMLElement>(
      '[role="menuitemradio"][aria-checked="true"]',
    )
    if (option) focusOption(option)
  })
})

onBeforeUnmount(stopListening)
</script>

<template>
  <div
    ref="root"
    :class="placement === 'above-center' || placement === 'row-start' ? undefined : 'relative'"
    @focusout="onFocusOut"
  >
    <button
      v-if="look === 'link'"
      ref="trigger"
      type="button"
      class="group outline-accent inline-flex items-center gap-1 rounded-[4px] font-extrabold whitespace-nowrap underline pointer-coarse:min-h-11 decoration-2 underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2"
      :class="
        open ? 'decoration-current' : 'decoration-ctrl-line pointer-fine:hover:decoration-current'
      "
      :aria-label="shortText ? text : undefined"
      aria-haspopup="menu"
      :aria-expanded="open"
      :aria-controls="open ? menuId : undefined"
      @click="open = !open"
    >
      {{ shortText ?? text }}
      <svg
        class="size-4 motion-safe:transition-transform motion-safe:duration-200"
        :class="{ 'rotate-180': open }"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2.4"
        stroke-linecap="round"
        stroke-linejoin="round"
        aria-hidden="true"
      >
        <path d="m6 9 6 6 6-6" />
      </svg>
    </button>
    <button
      v-else
      ref="trigger"
      type="button"
      class="rounded-pill outline-accent text-meta inline-flex min-h-[38px] items-center gap-2 border px-3.5 font-extrabold whitespace-nowrap focus-visible:outline-2 focus-visible:outline-offset-2 motion-safe:transition-transform motion-safe:duration-140 motion-safe:ease-out motion-safe:active:scale-[0.97] pointer-coarse:min-h-11"
      :class="
        open
          ? 'bg-sel-bg text-sel-text border-sel-border'
          : 'border-ctrl-line text-soft bg-transparent'
      "
      :aria-label="shortText ? text : undefined"
      aria-haspopup="menu"
      :aria-expanded="open"
      :aria-controls="open ? menuId : undefined"
      @click="open = !open"
    >
      <svg
        v-if="icon"
        class="size-4"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
        aria-hidden="true"
      >
        <path :d="icon" />
      </svg>
      {{ shortText ?? text }}
    </button>
    <div
      v-if="open"
      :id="menuId"
      ref="menu"
      role="menu"
      :aria-label="label"
      class="bg-panel border-line rounded-popover shadow-float text-text motion-safe:animate-pop-in absolute z-40 grid w-max max-w-[min(340px,calc(100vw-24px))] min-w-[190px] border p-1.5"
      :class="{
        'inset-s-0 inset-bs-full mbs-2.5 origin-top-left':
          placement === 'start' || placement === 'row-start',
        'inset-e-0 inset-bs-full mbs-2.5 origin-top-right': placement === 'end',
        'inset-s-1/2 inset-be-full mbe-2.5 max-h-[min(22rem,38dvh)] origin-bottom -translate-x-1/2 overflow-y-auto overscroll-contain':
          placement === 'above-center',
      }"
      @keydown="onMenuKey"
    >
      <template v-for="(group, index) in groups" :key="group.key">
        <span v-if="index > 0" class="bg-line mx-2 my-1.5 block h-px" aria-hidden="true"></span>
        <button
          v-for="option in group.options"
          :key="String(option.value)"
          type="button"
          role="menuitemradio"
          tabindex="-1"
          :aria-checked="option.value === group.value"
          class="outline-accent text-note flex min-h-11 w-full items-start gap-2.5 rounded-[10px] px-3 py-2.5 text-start font-bold focus-visible:outline-2 focus-visible:-outline-offset-2"
          :class="
            option.value === group.value ? 'bg-panel2 text-text' : 'text-soft hover:bg-panel2'
          "
          @click="pick(group.key, option.value)"
        >
          <span
            class="mbs-1.5 size-2 flex-none rounded-full"
            :class="option.value === group.value ? 'bg-accent' : 'bg-transparent'"
            aria-hidden="true"
          ></span>
          <span class="grid min-w-0 flex-1 gap-0.5">
            <span class="flex items-baseline justify-between gap-4">
              {{ option.label }}
              <span
                v-if="option.figure"
                class="font-display text-[15px] font-semibold whitespace-nowrap tabular-nums"
                :class="option.figureClass"
              >
                {{ option.figure }}
              </span>
            </span>
            <span v-if="option.hint" class="text-muted text-meta font-semibold">
              {{ option.hint }}
            </span>
          </span>
        </button>
      </template>
    </div>
  </div>
</template>
