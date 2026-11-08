<script setup lang="ts">
import { nextTick, onBeforeUnmount, useId, useTemplateRef, watch } from 'vue'

// Popover of the new design (DESIGN.md, Popover): a short floating list anchored
// to its trigger («Por confirmar», range selector). The trigger comes in the
// `trigger` slot with what it needs to wire itself (`toggle`, `expanded`,
// `panelId`); the content is the default slot. It asks to close (`open = false`)
// on a press outside and on Escape; on Escape focus goes back to what opened it.
defineProps<{
  /** Accessible name of the floating panel. */
  label: string
}>()

const open = defineModel<boolean>('open', { default: false })
const root = useTemplateRef<HTMLElement>('root')
const panelId = useId()
let opener: HTMLElement | null = null

function toggle(): void {
  open.value = !open.value
}

function onPointerDown(event: Event): void {
  if (event.target instanceof Node && root.value?.contains(event.target)) return
  open.value = false
}

function onKeyDown(event: KeyboardEvent): void {
  if (event.key !== 'Escape') return
  open.value = false
  const target = opener
  void nextTick(() => target?.focus())
}

watch(
  open,
  (isOpen) => {
    if (isOpen) {
      // Safari does not focus a button on click, so fall back to the trigger.
      const active = document.activeElement
      opener =
        active instanceof HTMLElement && active !== document.body
          ? active
          : (root.value?.querySelector<HTMLElement>('button, a[href]') ?? null)
      document.addEventListener('pointerdown', onPointerDown)
      document.addEventListener('keydown', onKeyDown)
    } else {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  },
  { immediate: true },
)

onBeforeUnmount(() => {
  document.removeEventListener('pointerdown', onPointerDown)
  document.removeEventListener('keydown', onKeyDown)
})
</script>

<template>
  <div ref="root" class="relative">
    <slot name="trigger" :toggle="toggle" :expanded="open" :panel-id="panelId" />
    <div
      v-if="open"
      :id="panelId"
      class="bg-panel border-line rounded-popover shadow-float motion-safe:animate-pop-in absolute inset-e-0 inset-bs-full z-40 mbs-2 w-[min(340px,calc(100vw-24px))] origin-top-right border p-4"
      role="dialog"
      :aria-label="label"
    >
      <slot />
    </div>
  </div>
</template>
