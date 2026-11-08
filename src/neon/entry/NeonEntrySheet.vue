<script setup lang="ts">
import { computed, nextTick, onMounted, reactive, ref, useTemplateRef, watch } from 'vue'

import { useEntrySheet } from '../../composables/useEntrySheet'
import { useSectionNavigation } from '../../composables/useSectionNavigation'
import { useToast } from '../../composables/useToast'
import { formatMonthName } from '../../lib/format'
import { ALL_MONTHS, monthFromDate } from '../../lib/month'
import { parseDecimal } from '../../lib/number'
import type { TransactionType } from '../../scripts/types'
import { monthFromISO, todayISO } from '../../scripts/utils'
import { useMovementsStore } from '../../stores/movements'
import { useUiStore } from '../../stores/ui'
import { ENTRY_TYPES } from './entry-types'

// «Apuntar» sheet of the new design (DESIGN.md, «Hoja / panel de alta»): a
// side panel from the `frame:` breakpoint up, a bottom sheet below it. Saving
// goes through the movements store, so the validations and the toast errors
// are the ones of the old panel. Every opening starts empty and at the top.
const EXIT_MS = 200
const DRAG_CLOSE_RATIO = 0.3
const DRAG_CLOSE_VELOCITY = 0.11

const { open, closeEntrySheet } = useEntrySheet()
const movementsStore = useMovementsStore()
const uiStore = useUiStore()
const { showToast } = useToast()
const { navigateTo } = useSectionNavigation()

const dialog = useTemplateRef<HTMLDialogElement>('dialog')
const scrollArea = useTemplateRef<HTMLElement>('scrollArea')
const sheet = useTemplateRef<HTMLElement>('sheet')
const grip = useTemplateRef<HTMLElement>('grip')
const amountInput = useTemplateRef<HTMLInputElement>('amountInput')

const form = reactive({
  type: 'expense' as TransactionType,
  amount: '',
  description: '',
  category: '',
  accountId: '',
  destinationAccountId: '',
  date: '',
  month: monthFromDate(new Date()),
})

const isSaving = computed(() => form.type === 'saving')
const monthOptions = ALL_MONTHS.map((month) => ({ value: month, label: formatMonthName(month) }))
const accountOptions = computed(() =>
  movementsStore.accounts.map((account) => ({ value: account.id, label: account.name })),
)
// A saving never lands in the account it leaves.
const destinationOptions = computed(() =>
  accountOptions.value.filter((option) => option.value !== form.accountId),
)
const categoryOptions = computed(() => {
  const names = movementsStore.orderedCategories(form.type)
  return names.length ? names : ['Sin categoría']
})

watch(
  () => form.type,
  () => {
    if (!categoryOptions.value.includes(form.category)) {
      form.category = categoryOptions.value[0] ?? ''
    }
    ensureDestination()
  },
)
watch(() => form.accountId, ensureDestination)

function ensureDestination(): void {
  if (!isSaving.value) return
  if (!destinationOptions.value.some((option) => option.value === form.destinationAccountId)) {
    form.destinationAccountId = destinationOptions.value[0]?.value ?? ''
  }
}

function onDateChange(): void {
  const month = monthFromISO(form.date)
  if (month !== null) form.month = month
}

function resetForm(): void {
  form.type = 'expense'
  form.amount = ''
  form.description = ''
  form.date = todayISO()
  onDateChange()
  form.accountId = movementsStore.accounts[0]?.id ?? ''
  form.category = categoryOptions.value[0] ?? ''
  form.destinationAccountId = ''
  ensureDestination()
}

function save(): void {
  const amount = parseDecimal(form.amount)
  const added = movementsStore.addTransaction({
    date: form.date || todayISO(),
    month: form.month,
    type: form.type,
    accountId: form.accountId,
    destinationAccountId: form.destinationAccountId,
    category: form.category,
    description: form.description,
    amount: Number.isFinite(amount) ? amount : 0,
  })
  if (!added) return
  showToast('Movimiento guardado.')
  closeEntrySheet()
}

function openInvestmentMovements(): void {
  closeEntrySheet()
  uiStore.ui.investmentTab = 'movements'
  navigateTo('investment')
}

// --- Opening and closing -------------------------------------------------

let opener: HTMLElement | null = null
let closeTimer: ReturnType<typeof setTimeout> | undefined

function reducedMotion(): boolean {
  return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false
}

function present(): void {
  const element = dialog.value
  if (!element) return
  clearTimeout(closeTimer)
  element.removeAttribute('data-closing')
  resetDrag()
  // Always empty, even when reopened while the exit animation still runs.
  resetForm()
  if (!element.open) {
    opener = document.activeElement instanceof HTMLElement ? document.activeElement : null
    element.showModal?.()
  }
  if (scrollArea.value) scrollArea.value.scrollTop = 0
  amountInput.value?.focus({ preventScroll: true })
}

function dismiss(): void {
  const element = dialog.value
  if (!element?.open) return
  const finish = () => {
    element.removeAttribute('data-closing')
    element.close()
    resetDrag()
    opener?.focus()
    opener = null
  }
  if (reducedMotion()) return finish()
  element.setAttribute('data-closing', '')
  closeTimer = setTimeout(finish, EXIT_MS)
}

watch(open, (value) => void nextTick(() => (value ? present() : dismiss())))
onMounted(() => {
  if (open.value) present()
})

function onCancel(event: Event): void {
  // Escape: the shared flag drives the close so state and dialog stay in step.
  event.preventDefault()
  closeEntrySheet()
}

function onScrimClick(event: MouseEvent): void {
  if (event.target === dialog.value) closeEntrySheet()
}

// --- Drag to close (bottom sheet only) -----------------------------------

let dragStart: { y: number; time: number } | null = null
let lastMove: { y: number; time: number } | null = null
let velocity = 0

function setOffset(offset: number, animated: boolean): void {
  const element = sheet.value
  if (!element) return
  element.style.transition = animated
    ? 'transform 320ms var(--ease-drawer, cubic-bezier(0.32, 0.72, 0, 1))'
    : 'none'
  element.style.transform = offset ? `translateY(${offset}px)` : ''
}

function resetDrag(): void {
  dragStart = null
  lastMove = null
  setOffset(0, false)
}

function onDragStart(event: PointerEvent): void {
  // The grip only takes layout in the bottom sheet: in the side panel there
  // is nothing to drag.
  if (!grip.value || grip.value.offsetParent === null) return
  if ((event.target as HTMLElement).closest('button')) return
  dragStart = { y: event.clientY, time: event.timeStamp }
  lastMove = dragStart
  velocity = 0
  ;(event.currentTarget as HTMLElement).setPointerCapture?.(event.pointerId)
}

function onDragMove(event: PointerEvent): void {
  if (!dragStart || !lastMove) return
  const delta = event.clientY - dragStart.y
  const elapsed = event.timeStamp - lastMove.time
  if (elapsed > 0) velocity = (event.clientY - lastMove.y) / elapsed
  lastMove = { y: event.clientY, time: event.timeStamp }
  // Upwards it yields less and less (square root).
  setOffset(delta >= 0 ? delta : -Math.sqrt(-delta) * 2, false)
}

function onDragEnd(event: PointerEvent): void {
  if (!dragStart) return
  const delta = event.clientY - dragStart.y
  const height = sheet.value?.offsetHeight ?? 0
  dragStart = null
  lastMove = null
  if (delta > height * DRAG_CLOSE_RATIO || velocity > DRAG_CLOSE_VELOCITY) {
    closeEntrySheet()
  } else {
    setOffset(0, true)
  }
}

const fieldClass =
  'bg-panel border-ctrl-line text-text outline-accent rounded-field min-h-[46px] w-full border px-3.5 text-[16px] font-bold focus-visible:outline-2 focus-visible:outline-offset-2'
const labelClass = 'text-muted grid gap-1.5 text-[13px] font-bold'
</script>

<template>
  <dialog
    id="neon-entry-sheet"
    ref="dialog"
    class="neon-entry text-text m-0 h-auto max-h-none w-full max-w-none bg-transparent p-0 backdrop:bg-[oklch(0%_none_none/0.55)]"
    aria-labelledby="neon-entry-title"
    @cancel="onCancel"
    @click="onScrimClick"
  >
    <div
      ref="sheet"
      class="bg-panel rounded-t-sheet shadow-sheet frame:rounded-none frame:border-line frame:border-s frame:shadow-float frame:h-dvh frame:max-h-dvh frame:w-[380px] frame:fixed frame:inset-bs-0 frame:inset-e-0 motion-safe:animate-sheet-in fixed inset-s-0 inset-e-0 inset-be-0 mx-auto flex max-h-[88%] w-full max-w-140 flex-col overflow-hidden"
    >
      <div
        class="frame:px-6 frame:pbs-6 touch-none px-4 pbs-2.5"
        @pointerdown="onDragStart"
        @pointermove="onDragMove"
        @pointerup="onDragEnd"
        @pointercancel="onDragEnd"
      >
        <div
          ref="grip"
          class="bg-ctrl-line frame:hidden rounded-pill mx-auto mbe-3.5 h-1 w-9"
          aria-hidden="true"
        ></div>
        <header class="mbe-3 flex items-center justify-between gap-3">
          <h2
            id="neon-entry-title"
            class="font-display text-h1-detail tracking-h1 leading-[1.15] font-bold"
          >
            Apuntar
          </h2>
          <button
            type="button"
            class="border-ctrl-line text-soft outline-accent grid size-11 shrink-0 place-items-center rounded-full border focus-visible:outline-2 focus-visible:outline-offset-2 motion-safe:transition-transform motion-safe:duration-140 motion-safe:ease-out motion-safe:active:scale-[0.97]"
            aria-label="Cerrar"
            @click="closeEntrySheet"
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
              <path d="M6 6l12 12M18 6 6 18" />
            </svg>
          </button>
        </header>
      </div>

      <form
        id="neon-entry-form"
        ref="scrollArea"
        class="frame:px-6 grid min-h-0 flex-1 content-start gap-4 overflow-y-auto overscroll-contain px-4 pbe-[calc(22px+env(safe-area-inset-bottom,0px))]"
        autocomplete="off"
        novalidate
        @submit.prevent="save"
      >
        <div
          class="bg-panel2 rounded-pill flex gap-[3px] p-[3px]"
          role="radiogroup"
          aria-label="Tipo de movimiento"
        >
          <button
            v-for="option in ENTRY_TYPES"
            :key="option.value"
            type="button"
            role="radio"
            :aria-checked="form.type === option.value"
            :data-entry-type="option.value"
            class="outline-accent rounded-pill min-h-9 flex-1 px-2 text-[14px] font-extrabold focus-visible:outline-2 focus-visible:outline-offset-2"
            :class="form.type === option.value ? 'bg-sel-bg text-sel-text' : 'text-soft'"
            @click="form.type = option.value"
          >
            {{ option.label }}
          </button>
        </div>

        <label class="grid gap-1.5">
          <span :class="labelClass">Importe</span>
          <span class="border-ctrl-line flex items-baseline gap-2 border-b-2 pbe-1.5">
            <input
              ref="amountInput"
              v-model="form.amount"
              name="amount"
              inputmode="decimal"
              placeholder="0,00"
              aria-label="Importe"
              class="font-display text-text placeholder:text-faint min-w-0 flex-1 bg-transparent text-[32px] leading-tight font-bold outline-none"
            />
            <span class="font-display text-muted text-[32px] leading-tight font-bold">€</span>
          </span>
        </label>

        <label :class="labelClass">
          Descripción
          <input
            v-model="form.description"
            name="description"
            maxlength="140"
            placeholder="Opcional"
            :class="fieldClass"
          />
        </label>

        <div class="grid grid-cols-2 gap-3">
          <label :class="labelClass">
            Categoría
            <select v-model="form.category" name="category" :class="fieldClass">
              <option v-for="name in categoryOptions" :key="name" :value="name">{{ name }}</option>
            </select>
          </label>
          <label :class="labelClass">
            {{ isSaving ? 'Cuenta origen' : 'Cuenta' }}
            <select v-model="form.accountId" name="accountId" :class="fieldClass">
              <option v-for="option in accountOptions" :key="option.value" :value="option.value">
                {{ option.label }}
              </option>
            </select>
          </label>
          <label v-if="isSaving" :class="[labelClass, 'col-span-2']">
            Cuenta destino
            <select
              v-model="form.destinationAccountId"
              name="destinationAccountId"
              :class="fieldClass"
            >
              <option
                v-for="option in destinationOptions"
                :key="option.value"
                :value="option.value"
              >
                {{ option.label }}
              </option>
            </select>
          </label>
          <label :class="labelClass">
            Fecha
            <input
              v-model="form.date"
              name="date"
              type="date"
              :class="fieldClass"
              @change="onDateChange"
            />
          </label>
          <label :class="labelClass">
            Cuenta en el mes
            <select v-model="form.month" name="month" :class="fieldClass">
              <option v-for="option in monthOptions" :key="option.value" :value="option.value">
                {{ option.label }}
              </option>
            </select>
          </label>
        </div>

        <p v-if="form.type === 'investment'" class="text-muted text-[13px]">
          ¿Compras o vendes títulos? Regístralo en
          <a
            href="/inversion"
            class="text-accent-text font-extrabold underline-offset-2 hover:underline"
            @click.prevent="openInvestmentMovements"
            >Inversión › Movimientos</a
          >
          para guardar símbolo, títulos y precio.
        </p>

        <div class="grid gap-2 pbs-2">
          <button
            type="submit"
            class="bg-accent text-on-accent font-display outline-text rounded-pill min-h-11 w-full border-0 px-[22px] text-[14px] font-bold focus-visible:outline-2 focus-visible:outline-offset-2 motion-safe:transition-transform motion-safe:duration-160 motion-safe:ease-out motion-safe:active:scale-[0.97]"
          >
            Guardar
          </button>
          <button
            type="button"
            class="text-soft outline-accent rounded-pill min-h-11 w-full text-[14px] font-extrabold focus-visible:outline-2 focus-visible:outline-offset-2"
            @click="closeEntrySheet"
          >
            Cancelar
          </button>
        </div>
      </form>
    </div>
  </dialog>
</template>

<style scoped>
@media (prefers-reduced-motion: no-preference) {
  .neon-entry[data-closing] > div {
    animation: neon-entry-out 200ms var(--ease-out, cubic-bezier(0.23, 1, 0.32, 1)) forwards;
  }
}

@keyframes neon-entry-out {
  to {
    opacity: 0;
    transform: translateY(48px);
  }
}
</style>
