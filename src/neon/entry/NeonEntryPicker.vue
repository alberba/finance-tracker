<script setup lang="ts" generic="T extends string | number">
import { computed, nextTick, ref, useId, useTemplateRef } from 'vue'

type Option<V> = { value: V; label: string; icon?: string }

const props = defineProps<{
  label: string
  text?: string
  icon?: string
  searchable?: boolean
  /**
   * A block of the mobile entry sheet: icon, label and a value that wraps
   * instead of being cut. Needs an icon.
   */
  tile?: boolean
  options?: ReadonlyArray<Option<T>>
  recent?: ReadonlyArray<Option<T>>
}>()

const value = defineModel<T>({ required: true })
const emit = defineEmits<{ open: [] }>()
const panelId = `neon-entry-picker-${useId()}`
const panel = useTemplateRef<HTMLElement>('panel')
const trigger = useTemplateRef<HTMLButtonElement>('trigger')
const expanded = ref(false)

const query = ref('')
const searchInput = useTemplateRef<HTMLInputElement>('search')
const showRecent = computed(() => Boolean(props.recent?.length) && !query.value.trim())
const filteredOptions = computed(() => {
  const term = normalize(query.value.trim())
  return term
    ? props.options?.filter((option) => normalize(option.label).includes(term))
    : props.options
})

function normalize(text: string): string {
  return text.toLocaleLowerCase('es').normalize('NFD').replace(/\p{M}/gu, '')
}

function onBeforeToggle(event: ToggleEvent): void {
  if (event.newState !== 'open') return
  query.value = ''
  emit('open')
}

function onToggle(event: ToggleEvent): void {
  expanded.value = event.newState === 'open'
  if (!expanded.value) return
  void nextTick(() => {
    const first =
      panel.value?.querySelector<HTMLElement>(
        props.searchable ? '[data-picker-option]' : '[data-picker-focus]',
      ) ?? panel.value?.querySelector<HTMLElement>('button')
    first?.focus()
  })
}

function pick(option: T): void {
  value.value = option
  panel.value?.hidePopover()
  trigger.value?.focus()
}

function focusFirstOption(): void {
  panel.value?.querySelector<HTMLElement>('[data-picker-option]')?.focus()
}

function clearSearch(): void {
  query.value = ''
  searchInput.value?.focus()
}

function moveOption(event: KeyboardEvent): void {
  const options = [
    ...(panel.value?.querySelectorAll<HTMLButtonElement>('[data-picker-option]') ?? []),
  ]
  const index = options.findIndex((option) => option === event.target)
  if (index < 0) return
  if (props.searchable && event.key === 'ArrowUp' && index === 0) {
    event.preventDefault()
    searchInput.value?.focus()
    return
  }
  const indexes: Record<string, number> = {
    ArrowDown: (index + 1) % options.length,
    ArrowUp: (index + options.length - 1) % options.length,
    Home: 0,
    End: options.length - 1,
  }
  const next = indexes[event.key]
  if (next === undefined) return
  event.preventDefault()
  options[next]?.focus()
}
</script>

<template>
  <div class="grid min-w-0 content-start gap-1.5">
    <span v-if="!icon" :id="`${panelId}-label`" class="text-muted text-[13px] font-bold">
      {{ label }}
    </span>
    <button
      ref="trigger"
      type="button"
      class="text-text rounded-field active:bg-panel2 flex min-w-0 items-center text-start font-bold underline-offset-4 focus-visible:underline focus-visible:outline-2 focus-visible:outline-transparent disabled:opacity-60"
      :class="
        tile
          ? 'bg-panel2 min-h-[54px] gap-2.5 rounded-[16px] px-3 py-2'
          : icon
            ? 'bg-bg min-h-14 gap-2.5 px-3 py-2'
            : 'bg-panel border-ctrl-line min-h-[46px] justify-between gap-1.5 border ps-3 pe-2.5 text-[16px]'
      "
      :aria-labelledby="`${panelId}-label`"
      :aria-describedby="`${panelId}-value`"
      :aria-expanded="expanded"
      aria-haspopup="dialog"
      :aria-controls="panelId"
      :popovertarget="panelId"
      :disabled="options?.length === 0"
    >
      <span
        v-if="icon"
        class="text-soft grid shrink-0 place-items-center"
        :class="tile ? 'bg-panel size-[34px] rounded-[11px]' : 'bg-panel2 size-8 rounded-lg'"
        aria-hidden="true"
      >
        <svg
          class="size-4.5"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="1.8"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <path :d="icon" />
        </svg>
      </span>
      <span :class="icon ? 'grid min-w-0 flex-1 gap-0.5' : 'min-w-0'">
        <span
          v-if="icon"
          :id="`${panelId}-label`"
          class="text-muted leading-none font-bold"
          :class="tile ? 'text-[12px]' : 'text-[11px]'"
        >
          {{ label }}
        </span>
        <span
          :id="`${panelId}-value`"
          class="block"
          :class="tile ? 'text-[15px] leading-tight font-extrabold text-balance' : 'truncate'"
        >
          {{ text ?? options?.find((option) => option.value === value)?.label ?? 'Sin opciones' }}
        </span>
      </span>
      <svg
        v-if="!tile"
        class="text-muted size-4 shrink-0"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
        aria-hidden="true"
      >
        <path d="m6 9 6 6 6-6" />
      </svg>
    </button>
    <div
      :id="panelId"
      ref="panel"
      popover="auto"
      role="dialog"
      :aria-labelledby="`${panelId}-label`"
      class="entry-picker bg-panel text-text border-line rounded-popover shadow-float overscroll-contain border p-2"
      :class="searchable && 'entry-picker-searchable'"
      @beforetoggle="onBeforeToggle"
      @toggle="onToggle"
      @keydown="moveOption"
    >
      <slot :pick="pick">
        <div :class="searchable && 'category-content flex flex-col gap-1'">
          <div
            v-if="searchable"
            class="bg-bg rounded-field text-muted focus-within:bg-panel2 m-1 flex min-h-11 shrink-0 items-center gap-2 px-3"
          >
            <svg
              class="size-4 shrink-0"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="1.9"
              stroke-linecap="round"
              aria-hidden="true"
            >
              <circle cx="10.5" cy="10.5" r="5.5" />
              <path d="m15 15 4 4" />
            </svg>
            <input
              ref="search"
              v-model="query"
              type="text"
              role="searchbox"
              aria-label="Buscar categoría"
              placeholder="Buscar categoría"
              autocomplete="off"
              class="text-text placeholder:text-muted caret-accent min-w-0 flex-1 bg-transparent text-[16px] font-bold outline-2 outline-transparent"
              @keydown.enter.prevent
              @keydown.down.prevent="focusFirstOption"
            />
            <button
              v-if="query"
              type="button"
              aria-label="Borrar búsqueda"
              class="text-muted active:bg-bg focus-visible:text-accent-text grid size-9 shrink-0 place-items-center rounded-lg focus-visible:outline-2 focus-visible:outline-transparent"
              @click="clearSearch"
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
                <path d="m6 6 12 12M18 6 6 18" />
              </svg>
            </button>
          </div>
          <div
            :class="searchable && 'category-list min-h-0 overflow-y-auto overscroll-contain p-1'"
          >
            <section
              v-if="showRecent"
              class="border-line mbe-2.5 border-be px-1 pbs-1 pbe-3"
              aria-label="Usadas recientemente"
            >
              <p class="text-muted mbe-1.5 text-[12px] font-extrabold">Usadas recientemente</p>
              <div class="flex flex-wrap gap-1.5">
                <button
                  v-for="option in recent"
                  :key="option.value"
                  type="button"
                  data-picker-option
                  :aria-pressed="option.value === value"
                  class="picker-option active:bg-panel2 flex min-h-11 max-w-full items-center gap-1.5 rounded-lg px-2.5 py-2 text-start text-[13px] font-bold underline-offset-4 focus-visible:underline focus-visible:outline-2 focus-visible:outline-transparent"
                  :class="option.value === value ? 'bg-accent/12' : 'bg-bg'"
                  @click="pick(option.value)"
                >
                  <svg
                    v-if="option.icon"
                    class="size-[1em] shrink-0"
                    :class="option.value === value ? 'text-accent-text' : 'text-muted'"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="1.9"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    aria-hidden="true"
                  >
                    <path :d="option.icon" />
                  </svg>
                  <span class="min-w-0 wrap-anywhere">{{ option.label }}</span>
                  <svg
                    v-if="option.value === value"
                    class="text-accent-text size-3.5 shrink-0"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    aria-hidden="true"
                  >
                    <path d="m5 12 4 4L19 6" />
                  </svg>
                </button>
              </div>
            </section>
            <p v-if="showRecent" class="text-muted px-1 pbe-1 text-[12px] font-extrabold">
              Todas las categorías
            </p>
            <button
              v-for="option in filteredOptions"
              :key="option.value"
              type="button"
              data-picker-option
              :data-picker-focus="option.value === value ? '' : undefined"
              :aria-pressed="option.value === value"
              class="picker-option active:bg-panel2 flex min-h-11 w-full items-center gap-2.5 rounded-lg px-3 py-2 text-start text-[14px] font-bold underline-offset-4 focus-visible:underline focus-visible:outline-2 focus-visible:outline-transparent"
              :class="option.value === value && (searchable ? 'bg-accent/12' : 'bg-panel2')"
              @click="pick(option.value)"
            >
              <span
                v-if="!icon"
                class="size-2 shrink-0 rounded-full"
                :class="option.value === value && 'bg-accent'"
                aria-hidden="true"
              />
              <svg
                v-if="option.icon"
                class="size-[1em] shrink-0"
                :class="searchable && option.value === value ? 'text-accent-text' : 'text-muted'"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="1.9"
                stroke-linecap="round"
                stroke-linejoin="round"
                aria-hidden="true"
              >
                <path :d="option.icon" />
              </svg>
              <span class="min-w-0 flex-1 wrap-anywhere">
                {{ option.label }}
              </span>
              <svg
                v-if="icon && option.value === value"
                class="text-accent-text size-4 shrink-0"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
                aria-hidden="true"
              >
                <path d="m5 12 4 4L19 6" />
              </svg>
            </button>
            <p
              v-if="searchable && !filteredOptions?.length"
              class="text-muted px-3 py-4 text-[13px] font-bold"
              role="status"
            >
              No hay categorías que coincidan.
            </p>
          </div>
        </div>
      </slot>
    </div>
  </div>
</template>

<style scoped>
.entry-picker {
  inline-size: min(18.5rem, calc(100vw - 24px));
  max-block-size: min(27rem, calc(var(--ui-dvh) - 24px));
  overflow: auto;
}

.entry-picker-searchable {
  inline-size: min(21rem, calc(100vw - 24px));
  overflow: clip;
}

.category-content {
  max-block-size: min(22rem, calc(var(--ui-dvh) - 42px));
}

@supports (scrollbar-width: thin) {
  .category-list {
    scrollbar-width: thin;
  }
}

@supports (scrollbar-color: auto) {
  .category-list {
    scrollbar-color: var(--color-ctrl-line) transparent;
  }
}

@supports (position-area: block-end span-inline-end) and (position-try-fallbacks: flip-block) and
  (position-try-fallbacks: flip-inline) {
  .entry-picker {
    margin: 0;
    margin-block-start: 0.375rem;
    position-area: block-end span-inline-end;
    position-try-fallbacks:
      flip-block,
      flip-inline,
      flip-block flip-inline;
  }
}

@media (hover: hover) and (pointer: fine) {
  .picker-option:hover {
    background-color: var(--color-panel2);
  }
}
</style>
