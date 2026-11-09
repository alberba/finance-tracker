<script setup lang="ts">
import { getPathFromSection } from '../../scripts/app/dashboard-section-routing'
import type { SectionId } from '../../scripts/types'

// Card of the new design (DESIGN.md, Tarjeta): a block title on top and the
// content below. `to` adds the arrow that opens that section («Ir a
// Patrimonio»); it is a real link, so it can be opened in a new tab, and a
// plain click is handed to `navigate` to move inside the app.
const props = defineProps<{
  title: string
  titleId: string
  to?: { section: SectionId; label: string }
}>()

const emit = defineEmits<{ navigate: [section: SectionId] }>()

function follow(event: MouseEvent): void {
  if (!props.to || event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return
  event.preventDefault()
  emit('navigate', props.to.section)
}
</script>

<template>
  <section
    class="bg-panel border-line rounded-card flex min-w-0 flex-col gap-3.5 border px-6 py-[22px]"
    :aria-labelledby="titleId"
  >
    <div class="flex flex-wrap items-center justify-between gap-2.5">
      <div class="flex items-center gap-2.5">
        <h2 :id="titleId" class="text-block-title text-text font-extrabold">{{ title }}</h2>
        <slot name="badge" />
      </div>
      <div class="flex items-center gap-3">
        <slot name="actions" />
        <a
          v-if="to"
          :href="getPathFromSection(to.section)"
          :aria-label="to.label"
          class="text-muted hover:text-text outline-accent -my-2 -me-2.5 grid size-11 shrink-0 place-items-center rounded-full focus-visible:outline-2 focus-visible:outline-offset-2"
          @click="follow"
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
            <path d="M7 17 17 7M8 7h9v9" />
          </svg>
        </a>
      </div>
    </div>
    <slot />
  </section>
</template>
