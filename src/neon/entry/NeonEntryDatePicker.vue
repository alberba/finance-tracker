<script setup lang="ts">
import { computed, nextTick, ref, useTemplateRef } from 'vue'

import { formatLongDate, formatShortDate } from '../../lib/format'
import { todayISO } from '../../scripts/utils'
import NeonEntryPicker from './NeonEntryPicker.vue'

const CALENDAR_ICON = 'M4 6h16v14H4zM4 10h16M8 3v5M16 3v5'

const props = defineProps<{
  /** A block of the mobile entry sheet (see NeonEntryPicker), with a calendar icon. */
  tile?: boolean
  /** Overrides the trigger's text. */
  text?: string
  /** With them, the panel also chooses the accounting month (`v-model:accounting-month`). */
  months?: ReadonlyArray<{ value: number; label: string }>
}>()
const value = defineModel<string>({ required: true })
const accountingMonth = defineModel<number>('accountingMonth')
const view = ref(new Date())
const active = ref('')
const typed = ref('')
const invalid = ref(false)
const grid = useTemplateRef<HTMLElement>('grid')

const monthFormat = new Intl.DateTimeFormat('es-ES', {
  month: 'long',
  year: 'numeric',
  timeZone: 'UTC',
})
const weekdays = ['L', 'M', 'X', 'J', 'V', 'S', 'D']
const year = computed(() => view.value.getUTCFullYear())
const month = computed(() => view.value.getUTCMonth())
const firstColumn = computed(() => ((view.value.getUTCDay() + 6) % 7) + 1)
const days = computed(() =>
  Array.from({ length: dateAt(year.value, month.value + 1, 0).getUTCDate() }, (_, index) =>
    dateAt(year.value, month.value, index + 1)
      .toISOString()
      .slice(0, 10),
  ),
)

function dateAt(year: number, month: number, day: number): Date {
  return new Date(Date.UTC(year, month, day))
}

function showDay(iso: string): void {
  const date = new Date(iso)
  view.value = dateAt(date.getUTCFullYear(), date.getUTCMonth(), 1)
  active.value = iso
}

function reset(): void {
  showDay(value.value || todayISO())
  typed.value = value.value.split('-').reverse().join('/')
  invalid.value = false
}

function moveMonth(delta: number): void {
  showDay(
    dateAt(year.value, month.value + delta, 1)
      .toISOString()
      .slice(0, 10),
  )
}

function moveDay(event: KeyboardEvent): void {
  if (!(event.target instanceof HTMLElement) || !event.target.hasAttribute('data-day')) return
  const offsets: Record<string, number> = {
    ArrowLeft: -1,
    ArrowRight: 1,
    ArrowUp: -7,
    ArrowDown: 7,
  }
  const offset = offsets[event.key]
  if (offset === undefined) return
  event.preventDefault()
  const day = new Date(active.value)
  const next = dateAt(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate() + offset)
  showDay(next.toISOString().slice(0, 10))
  void nextTick(() => grid.value?.querySelector<HTMLElement>('[data-picker-focus]')?.focus())
}

function applyTyped(pick: (value: string) => void): void {
  const parts = /^(\d{1,2})\/(\d{1,2})\/([1-9]\d{3})$/.exec(typed.value.trim())
  if (parts) {
    const [, day, month, year] = parts
    const iso = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`
    const date = dateAt(Number(year), Number(month) - 1, Number(day))
    if (date.toISOString().slice(0, 10) === iso) return pick(iso)
  }
  invalid.value = true
}
</script>

<template>
  <NeonEntryPicker
    v-model="value"
    label="Fecha"
    :tile="props.tile"
    :icon="props.tile ? CALENDAR_ICON : undefined"
    :text="props.text ?? (value ? formatShortDate(value) : 'Elegir fecha')"
    @open="reset"
  >
    <template #default="{ pick }">
      <div class="flex items-center justify-between gap-1">
        <button
          type="button"
          aria-label="Mes anterior"
          class="active:bg-panel2 focus-visible:bg-panel2 focus-visible:text-accent-text grid size-10 shrink-0 place-items-center rounded-lg focus-visible:outline-2 focus-visible:outline-transparent"
          @click="moveMonth(-1)"
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
            <path d="m15 6-6 6 6 6" />
          </svg>
        </button>
        <p class="text-[14px] font-extrabold first-letter:uppercase" aria-live="polite">
          {{ monthFormat.format(view) }}
        </p>
        <button
          type="button"
          aria-label="Mes siguiente"
          class="active:bg-panel2 focus-visible:bg-panel2 focus-visible:text-accent-text grid size-10 shrink-0 place-items-center rounded-lg focus-visible:outline-2 focus-visible:outline-transparent"
          @click="moveMonth(1)"
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
            <path d="m9 6 6 6-6 6" />
          </svg>
        </button>
      </div>
      <div class="text-muted grid grid-cols-7 text-center text-[12px] font-bold" aria-hidden="true">
        <span v-for="day in weekdays" :key="day">{{ day }}</span>
      </div>
      <div
        ref="grid"
        role="group"
        :aria-label="monthFormat.format(view)"
        class="grid grid-cols-7 gap-px pbs-1"
        @keydown="moveDay"
      >
        <button
          v-for="(iso, index) in days"
          :key="iso"
          type="button"
          data-day
          :data-picker-focus="iso === active ? '' : undefined"
          :tabindex="iso === active ? 0 : -1"
          :aria-label="formatLongDate(iso)"
          :aria-pressed="iso === value"
          class="active:bg-panel2 min-h-9 rounded-lg text-[13px] font-bold tabular-nums underline-offset-4 focus-visible:underline focus-visible:outline-2 focus-visible:outline-transparent"
          :class="
            iso === value ? 'bg-sel-bg text-sel-text' : iso === todayISO() && 'text-accent-text'
          "
          :style="index === 0 ? { gridColumnStart: firstColumn } : undefined"
          @click="pick(iso)"
        >
          {{ index + 1 }}
        </button>
      </div>
      <div class="border-line mbs-2 flex gap-1.5 border-bs pbs-2">
        <input
          v-model="typed"
          type="text"
          maxlength="10"
          placeholder="DD/MM/AAAA"
          aria-label="Escribir fecha"
          :aria-invalid="invalid || undefined"
          class="text-text bg-panel border-ctrl-line rounded-field caret-accent focus-visible:bg-panel2 min-h-11 min-w-0 flex-1 border px-2.5 text-[16px] font-bold focus-visible:outline-2 focus-visible:outline-transparent"
          @input="invalid = false"
          @keydown.enter.stop.prevent="applyTyped(pick)"
        />
        <button
          type="button"
          class="bg-panel2 text-text rounded-field active:bg-bg min-h-11 px-2.5 text-[13px] font-bold underline-offset-4 focus-visible:underline focus-visible:outline-2 focus-visible:outline-transparent"
          @click="applyTyped(pick)"
        >
          Aplicar
        </button>
      </div>
      <p v-if="invalid" class="text-loss pbs-1 text-[12px]" role="alert">
        Escribe una fecha válida en formato DD/MM/AAAA.
      </p>
      <label
        v-if="props.months"
        class="border-line text-muted mbs-2 flex items-center justify-between gap-3 border-bs pbs-2 text-[13px] font-bold"
      >
        Cuenta en el mes
        <select
          v-model="accountingMonth"
          class="text-text bg-panel border-ctrl-line rounded-field min-h-11 border px-2.5 text-[16px] font-bold"
        >
          <option v-for="option in props.months" :key="option.value" :value="option.value">
            {{ option.label }}
          </option>
        </select>
      </label>
    </template>
  </NeonEntryPicker>
</template>
