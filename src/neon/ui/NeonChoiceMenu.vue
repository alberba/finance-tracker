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
}

export interface ChoiceGroup<V> {
  key: string
  options: ReadonlyArray<ChoiceOption<V>>
  value: V
}

defineProps<{
  /** What the pill shows: the current choice. */
  text: string
  /** Accessible name of the list («Cómo medir la rentabilidad»). */
  label: string
  /** `d` of the pill's 24×24 icon. */
  icon: string
  groups: ReadonlyArray<ChoiceGroup<T>>
}>()

const emit = defineEmits<{ select: [key: string, value: T] }>()

const open = ref(false)
const root = useTemplateRef<HTMLElement>('root')
const trigger = useTemplateRef<HTMLButtonElement>('trigger')
const menuId = useId()

function close(returnFocus = false): void {
  open.value = false
  if (returnFocus) void nextTick(() => trigger.value?.focus())
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

function stopListening(): void {
  document.removeEventListener('pointerdown', onPointerDown)
  document.removeEventListener('keydown', onKeyDown)
}

watch(open, (isOpen) => {
  if (!isOpen) return stopListening()
  document.addEventListener('pointerdown', onPointerDown)
  document.addEventListener('keydown', onKeyDown)
  void nextTick(() =>
    root.value?.querySelector<HTMLElement>('[role="menuitemradio"][aria-checked="true"]')?.focus(),
  )
})

onBeforeUnmount(stopListening)
</script>

<template>
  <div ref="root" class="relative">
    <button
      ref="trigger"
      type="button"
      class="rounded-pill outline-accent text-meta inline-flex min-h-[38px] items-center gap-2 border px-3.5 font-extrabold whitespace-nowrap focus-visible:outline-2 focus-visible:outline-offset-2 motion-safe:transition-transform motion-safe:duration-140 motion-safe:ease-out motion-safe:active:scale-[0.97]"
      :class="
        open
          ? 'bg-sel-bg text-sel-text border-sel-border'
          : 'border-ctrl-line text-soft bg-transparent'
      "
      aria-haspopup="menu"
      :aria-expanded="open"
      :aria-controls="open ? menuId : undefined"
      @click="open = !open"
    >
      <svg
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
      {{ text }}
    </button>
    <div
      v-if="open"
      :id="menuId"
      role="menu"
      :aria-label="label"
      class="bg-panel border-line rounded-popover shadow-float text-text motion-safe:animate-pop-in absolute inset-e-0 inset-bs-full z-40 mbs-2.5 grid w-max max-w-[min(340px,calc(100vw-24px))] min-w-[190px] origin-top-right border p-1.5"
    >
      <template v-for="(group, index) in groups" :key="group.key">
        <span v-if="index > 0" class="bg-line mx-2 my-1.5 block h-px" aria-hidden="true"></span>
        <button
          v-for="option in group.options"
          :key="String(option.value)"
          type="button"
          role="menuitemradio"
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
          <span class="grid gap-0.5">
            <span>{{ option.label }}</span>
            <span v-if="option.hint" class="text-muted text-meta font-semibold">
              {{ option.hint }}
            </span>
          </span>
        </button>
      </template>
    </div>
  </div>
</template>
