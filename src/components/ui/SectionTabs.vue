<script setup lang="ts">
import { nextTick, useTemplateRef } from 'vue'

export interface SectionTab {
  id: string
  label: string
  /** Shown next to the label; omitted when null or undefined. */
  count?: number | null
  /** Explicit id for the tab button, when a panel is labelled by it. */
  buttonId?: string
}

// Underlined sub-section tabs with optional counts (WAI-ARIA tabs pattern,
// automatic activation). Panels live outside, with id `${panelIdPrefix}${tab.id}`.
const props = defineProps<{
  tabs: SectionTab[]
  label: string
  panelIdPrefix: string
  /** Also exposes each tab id as `data-${dataKey}`, for tests and scripts. */
  dataKey?: string
}>()

const active = defineModel<string>({ required: true })
const tabList = useTemplateRef<HTMLElement>('tabList')

function dataAttrs(tab: SectionTab): Record<string, string> {
  return props.dataKey ? { [`data-${props.dataKey}`]: tab.id } : {}
}

async function focusTab(index: number): Promise<void> {
  const tab = props.tabs[(index + props.tabs.length) % props.tabs.length]
  active.value = tab.id
  await nextTick()
  tabList.value?.querySelector<HTMLElement>('[aria-selected="true"]')?.focus()
}

function onKeydown(event: KeyboardEvent): void {
  const current = props.tabs.findIndex((tab) => tab.id === active.value)
  const moves: Record<string, number> = {
    ArrowRight: current + 1,
    ArrowLeft: current - 1,
    Home: 0,
    End: props.tabs.length - 1,
  }
  if (!(event.key in moves)) return
  event.preventDefault()
  void focusTab(moves[event.key])
}
</script>

<template>
  <div
    ref="tabList"
    class="border-line flex gap-6 overflow-x-auto border-b sm:gap-8"
    role="tablist"
    :aria-label="label"
    @keydown="onKeydown"
  >
    <button
      v-for="tab in tabs"
      :id="tab.buttonId"
      :key="tab.id"
      type="button"
      role="tab"
      class="focus-visible:outline-primary flex min-h-11 shrink-0 items-baseline gap-2 border-b-2 px-0.5 pt-3 pb-3 text-base whitespace-nowrap focus-visible:outline-2 focus-visible:-outline-offset-2"
      :class="
        active === tab.id
          ? 'border-primary text-text-main font-bold'
          : 'text-text-muted hover:text-text-main border-transparent font-semibold'
      "
      :aria-selected="active === tab.id"
      :aria-controls="`${panelIdPrefix}${tab.id}`"
      :tabindex="active === tab.id ? 0 : -1"
      v-bind="dataAttrs(tab)"
      @click="active = tab.id"
    >
      {{ tab.label }}
      <span
        v-if="tab.count !== null && tab.count !== undefined"
        class="font-display text-xs tabular-nums"
        data-tab-count
      >
        {{ tab.count }}
      </span>
    </button>
  </div>
</template>
