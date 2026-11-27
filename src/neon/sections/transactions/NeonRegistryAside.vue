<script setup lang="ts">
import { computed, ref } from 'vue'

import NeonFigure from '../../ui/NeonFigure.vue'
import type { Breakdown, FilterSummary } from './registry-view-model'

// «Resumen del filtro»: the month the registry starts from (a small switch,
// the ledger's card carries its title), the figure of what the filters leave in
// it, and its split by category as a tool: the whole split in one strip of
// neutral tones, largest first, and the first categories as rows that filter
// the ledger (pressing the picked one again clears it). The split ignores the
// category filter, so the picked row stays among the others, inverted, and the
// rest dim.
const props = defineProps<{
  monthTitle: string
  isLatestMonth: boolean
  summary: FilterSummary
  breakdown: Breakdown
  /** The category the ledger is narrowed to, or empty. */
  category: string
}>()

const emit = defineEmits<{ step: [delta: -1 | 1]; pick: [category: string] }>()

const SHOWN = 6
const expanded = ref(false)

// Neutral steps from the text colour into the panel: the largest darkest on
// light themes, brightest on dark ones. Colour stays for what deviates.
const TONES = [100, 72, 52, 36, 24]
function tone(index: number): string {
  const share = TONES[Math.min(index, TONES.length - 1)]
  return `color-mix(in oklch, var(--color-text) ${share}%, var(--color-panel))`
}

// Where each segment's middle falls along the strip (0–100), to lean its pill
// inwards at the ends so it never leaves the card.
const rows = computed(() => {
  let start = 0
  const total = props.breakdown.rows.reduce((sum, row) => sum + row.width, 0) || 1
  return props.breakdown.rows.map((row, index) => {
    const center = ((start + row.width / 2) / total) * 100
    start += row.width
    return { ...row, tone: tone(index), center }
  })
})

// The category under the pointer or the keyboard focus, on the strip or in
// the list: its segment names itself in a pill with its share, its row lights
// up, and the other segments step back.
const hovered = ref<string | null>(null)

function lean(center: number): string {
  if (center < 22) return 'start-0'
  if (center > 78) return 'end-0'
  return 'start-1/2 -translate-x-1/2'
}

function pick(name: string): void {
  emit('pick', name === props.category ? '' : name)
}
const visible = computed(() => {
  if (expanded.value) return rows.value
  const first = rows.value.slice(0, SHOWN)
  // The picked category always shows, even when it falls beyond the first rows.
  const picked = rows.value.find((row) => row.name === props.category)
  return picked && !first.includes(picked) ? [...first, picked] : first
})
const hidden = computed(() => rows.value.length - visible.value.length)

const arrowClass =
  'border-ctrl-line text-text outline-accent grid size-9 place-items-center rounded-full border focus-visible:outline-2 focus-visible:outline-offset-2 aria-disabled:opacity-40 motion-safe:transition-transform motion-safe:duration-140 motion-safe:active:scale-[0.97]'
</script>

<template>
  <aside
    aria-label="Resumen del filtro"
    class="bg-panel border-line rounded-card grid gap-5 self-start border px-6 py-[22px]"
    data-registry-aside
  >
    <div class="grid gap-1.5">
      <div class="flex items-center justify-between gap-2">
        <h2 class="text-soft text-[15px] font-extrabold" aria-live="polite" data-registry-month>
          {{ monthTitle }}
        </h2>
        <div class="flex gap-1.5">
          <button
            type="button"
            :class="arrowClass"
            aria-label="Mes anterior"
            @click="emit('step', -1)"
          >
            <svg
              class="size-[18px]"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
              aria-hidden="true"
            >
              <path d="M15 6l-6 6 6 6" />
            </svg>
          </button>
          <button
            type="button"
            :class="arrowClass"
            aria-label="Mes siguiente"
            :aria-disabled="isLatestMonth"
            @click="!isLatestMonth && emit('step', 1)"
          >
            <svg
              class="size-[18px]"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
              aria-hidden="true"
            >
              <path d="M9 6l6 6-6 6" />
            </svg>
          </button>
        </div>
      </div>
      <p class="text-figure-lg font-semibold" data-registry-total>
        <span :key="summary.total" class="motion-safe:animate-swap inline-block">
          <NeonFigure :value="summary.total" />
        </span>
      </p>
      <p class="text-soft text-[14px]">{{ category ? `${category} · ` : '' }}{{ summary.count }}</p>
    </div>

    <div class="border-line grid gap-3.5 border-t pbs-[18px]">
      <div class="flex items-baseline justify-between gap-3">
        <h3 class="text-[18px] font-extrabold">{{ breakdown.title }}</h3>
        <span v-if="rows.length > 1" class="text-muted text-[13px]">Pulsa para filtrar</span>
      </div>
      <template v-if="rows.length">
        <div class="mbs-5 flex h-2.5 gap-0.5" role="group" aria-label="Reparto por categoría">
          <button
            v-for="row in rows"
            :key="row.name"
            type="button"
            class="outline-accent first:rounded-s-pill last:rounded-e-pill relative block h-full min-w-[3px] before:absolute before:inset-x-0 before:-inset-y-2.5 focus-visible:outline-2 focus-visible:outline-offset-3 motion-safe:transition-[opacity,scale] motion-safe:duration-200 motion-safe:ease-out"
            :class="[
              (hovered && hovered !== row.name) || (!hovered && category && row.name !== category)
                ? 'opacity-30'
                : '',
            ]"
            :style="{ flexGrow: row.width, flexBasis: 0, background: row.tone }"
            :aria-label="`${row.name}: ${row.share}`"
            :aria-pressed="row.name === category"
            tabindex="-1"
            @pointerenter="hovered = row.name"
            @pointerleave="hovered = null"
            @click="pick(row.name)"
          >
            <span
              v-if="hovered === row.name"
              class="bg-sel-bg text-sel-text text-meta rounded-pill motion-safe:animate-pop-in pointer-events-none absolute bottom-full z-10 mb-2.5 px-2.5 py-1 font-extrabold whitespace-nowrap tabular-nums shadow-(--shadow-float)"
              :class="lean(row.center)"
              aria-hidden="true"
            >
              {{ row.name }} <span class="opacity-65">{{ row.share }}</span>
            </span>
          </button>
        </div>
        <ul class="-mx-3 grid gap-0.5" data-tx-breakdown>
          <li v-for="row in visible" :key="row.name">
            <button
              type="button"
              class="neon-cat outline-accent relative isolate grid min-h-11 w-full grid-cols-[10px_minmax(0,1fr)_auto_auto] items-center gap-3 rounded-[14px] px-3 text-start text-[15px] font-semibold focus-visible:outline-2 focus-visible:-outline-offset-2 motion-safe:transition-[background-color,color,opacity,scale] motion-safe:duration-200 motion-safe:ease-out motion-safe:active:scale-[0.985]"
              :class="[
                row.name === category ? 'is-on text-sel-text' : category && 'opacity-45',
                hovered === row.name && row.name !== category && 'bg-panel2 opacity-100!',
              ]"
              :aria-pressed="row.name === category"
              :aria-label="`${row.name}: ${row.amount}, ${row.share}`"
              data-breakdown-category
              @pointerenter="hovered = row.name"
              @pointerleave="hovered = null"
              @focus="hovered = row.name"
              @blur="hovered = null"
              @click="pick(row.name)"
            >
              <span
                class="neon-cat-fill bg-sel-bg absolute inset-0 -z-10 rounded-[14px]"
                aria-hidden="true"
              ></span>
              <span class="size-2.5 rounded-[3px]" :style="{ background: row.tone }"></span>
              <span class="min-w-0 truncate">{{ row.name }}</span>
              <span class="text-[13px] font-bold tabular-nums opacity-70">{{ row.count }}</span>
              <span
                class="font-display min-w-[92px] text-end text-[14.5px] font-semibold whitespace-nowrap tabular-nums"
              >
                {{ row.amount }}
              </span>
            </button>
          </li>
        </ul>
        <button
          v-if="hidden > 0 || expanded"
          type="button"
          class="text-soft outline-accent justify-self-start rounded-sm text-[14px] font-extrabold underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2"
          :aria-expanded="expanded"
          @click="expanded = !expanded"
        >
          {{
            expanded
              ? 'Ver menos'
              : `${hidden} ${hidden === 1 ? 'categoría más' : 'categorías más'}`
          }}
        </button>
      </template>
      <p v-else class="text-muted text-[14px]">Nada que sumar con estos filtros.</p>
    </div>
  </aside>
</template>

<style scoped>
/* Picking a category: the selection colour sweeps in from the start of the row
   (280ms) and goes back the same way, faster (180ms). Without motion it swaps. */
.neon-cat-fill {
  opacity: 0;
}

.neon-cat.is-on .neon-cat-fill {
  opacity: 1;
}

@media (prefers-reduced-motion: no-preference) {
  .neon-cat-fill {
    opacity: 1;
    clip-path: inset(0 100% 0 0 round 14px);
    transition: clip-path 180ms var(--ease-out);
  }

  .neon-cat.is-on .neon-cat-fill {
    clip-path: inset(0 0 0 0 round 14px);
    transition-duration: 280ms;
  }
}
</style>
