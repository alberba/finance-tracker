<script setup lang="ts">
import { nextTick, onBeforeUnmount, ref, useId, useTemplateRef, watch } from 'vue'

// One filter of the registry as a chip that says its value («Tipo · Gastos»)
// and opens its own floating panel (DESIGN.md, Popover). With `options` the
// panel is a list of exclusive choices: picking one applies it and closes it.
// Without them the panel holds the default slot (the day, the amount range).
// A chip with a filter on inverts to the selection colours. A press outside and
// Escape close it; Escape also gives the focus back to the chip. With `sheet`
// (the chips of the phone, in a row that slides sideways and would clip a
// popover) the panel is a sheet from the bottom of the screen over a scrim.
export interface FilterOption {
  value: string
  label: string
  /** Background class of the dot before the label (the type colours). */
  dot?: string
}

const props = withDefaults(
  defineProps<{
    /** What is filtered («Tipo», «Cuenta»). */
    name: string
    /** The current value («Todos», «Gastos»). */
    value: string
    /** Whether the filter narrows the list. */
    active: boolean
    /** Accessible name of the panel. */
    panelLabel: string
    options?: ReadonlyArray<FilterOption>
    selected?: string
    /**
     * Line the panel up with the chip's end edge while the registry is narrow
     * (the chips in the right column of the phone grid), so it stays on screen.
     */
    endWhenNarrow?: boolean
    /** Open the panel as a bottom sheet instead of a popover. */
    sheet?: boolean
  }>(),
  { options: undefined, selected: undefined, endWhenNarrow: false, sheet: false },
)

const emit = defineEmits<{ select: [value: string] }>()

const open = ref(false)
const root = useTemplateRef<HTMLElement>('root')
const trigger = useTemplateRef<HTMLButtonElement>('trigger')
const panel = useTemplateRef<HTMLElement>('panel')
const panelId = useId()

function close(returnFocus = false): void {
  open.value = false
  if (returnFocus) void nextTick(() => trigger.value?.focus())
}

function pick(value: string): void {
  emit('select', value)
  close(true)
}

function onPointerDown(event: Event): void {
  const target = event.target
  if (target instanceof Node && (root.value?.contains(target) || panel.value?.contains(target)))
    return
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
    panel.value
      ?.querySelector<HTMLElement>(
        props.options ? '[role="menuitemradio"][aria-checked="true"]' : 'input, button',
      )
      ?.focus(),
  )
})

onBeforeUnmount(stopListening)

defineExpose({ close })
</script>

<template>
  <div ref="root" class="relative">
    <button
      ref="trigger"
      type="button"
      class="rounded-pill outline-accent inline-flex min-h-[40px] w-full min-w-0 items-center gap-1.5 border ps-3.5 pe-2.5 text-[14px] font-extrabold whitespace-nowrap focus-visible:outline-2 focus-visible:outline-offset-2 motion-safe:transition-[background-color,border-color,color,scale] motion-safe:duration-160 motion-safe:ease-out motion-safe:active:scale-[0.97] pointer-coarse:min-h-11"
      :class="
        active || open
          ? 'bg-sel-bg text-sel-text border-sel-border'
          : 'border-ctrl-line text-text bg-transparent'
      "
      :aria-label="`${name}: ${value}`"
      :aria-haspopup="options ? 'menu' : 'dialog'"
      :aria-expanded="open"
      :aria-controls="open ? panelId : undefined"
      :data-filter-chip="name"
      @click="open = !open"
    >
      <span :class="active || open ? 'opacity-75' : 'text-muted'">{{ name }}</span>
      <span class="min-w-0 flex-1 truncate text-start">{{ value }}</span>
      <svg
        class="size-4 flex-none motion-safe:transition-transform motion-safe:duration-160 motion-safe:ease-out"
        :class="open && 'rotate-180'"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
        aria-hidden="true"
      >
        <path d="M7 10l5 5 5-5" />
      </svg>
    </button>
    <Teleport to="body" :disabled="!sheet">
      <div
        v-if="open && sheet"
        class="motion-safe:animate-fade-in fixed inset-0 z-[60] bg-[oklch(0%_none_none/0.45)]"
        aria-hidden="true"
      ></div>
      <div
        v-if="open"
        :id="panelId"
        ref="panel"
        :role="options ? 'menu' : 'dialog'"
        :aria-label="panelLabel"
        class="bg-panel text-text grid"
        :class="[
          sheet
            ? 'shadow-sheet motion-safe:animate-sheet-in fixed inset-x-0 inset-be-0 z-[61] max-h-[85dvh] overflow-y-auto rounded-t-[28px] px-4 pbs-2.5 pbe-[calc(24px+env(safe-area-inset-bottom,0px))]'
            : [
                'border-line rounded-popover shadow-float motion-safe:animate-pop-in absolute inset-bs-full z-40 mbs-2 w-max max-w-[calc(100vw-24px)] min-w-[240px] border',
                options ? 'p-1.5' : 'gap-4 p-4',
                endWhenNarrow
                  ? 'inset-e-0 origin-top-right @min-[720px]/registry:inset-s-0 @min-[720px]/registry:inset-e-auto @min-[720px]/registry:origin-top-left'
                  : 'inset-s-0 origin-top-left',
              ],
          sheet && !options && 'gap-4',
        ]"
      >
        <span
          v-if="sheet"
          class="bg-ctrl-line mbe-1 h-1 w-9 justify-self-center rounded-full"
          aria-hidden="true"
        ></span>
        <template v-if="options">
          <p
            class="px-3 pbs-2 pbe-1.5 font-extrabold"
            :class="
              sheet ? 'text-text text-[18px]' : 'text-muted text-label tracking-label uppercase'
            "
          >
            {{ panelLabel }}
          </p>
          <button
            v-for="option in options"
            :key="option.value"
            type="button"
            role="menuitemradio"
            :aria-checked="option.value === selected"
            class="outline-accent flex w-full items-center gap-3 rounded-[14px] px-3 text-start font-bold focus-visible:outline-2 focus-visible:-outline-offset-2"
            :class="[
              sheet ? 'min-h-[52px] text-[16px]' : 'min-h-11 text-[15px]',
              option.value === selected
                ? 'bg-panel2 text-text'
                : 'text-soft pointer-fine:hover:bg-panel2 pointer-fine:hover:text-text',
            ]"
            @click="pick(option.value)"
          >
            <span
              class="size-2 flex-none rounded-full"
              :class="option.dot ?? 'bg-ctrl-line'"
              aria-hidden="true"
            ></span>
            <span class="min-w-0 flex-1 truncate">{{ option.label }}</span>
            <svg
              v-if="option.value === selected"
              class="text-accent-text size-[18px] flex-none"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
              aria-hidden="true"
            >
              <path d="M5 12.5l4.5 4.5L19 7.5" />
            </svg>
          </button>
        </template>
        <template v-else>
          <p v-if="sheet" class="text-[18px] font-extrabold">{{ panelLabel }}</p>
          <slot :close="close" />
        </template>
      </div>
    </Teleport>
  </div>
</template>
