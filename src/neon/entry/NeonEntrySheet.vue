<script setup lang="ts">
import { computed, nextTick, onMounted, reactive, ref, useTemplateRef, watch } from 'vue'

import { useEntrySheet } from '../../composables/useEntrySheet'
import { useMoneyFormatter } from '../../composables/useMoneyFormatter'
import { useSectionNavigation } from '../../composables/useSectionNavigation'
import { useToast } from '../../composables/useToast'
import { formatMonthName } from '../../lib/format'
import { ALL_MONTHS, monthFromDate } from '../../lib/month'
import { parseDecimal } from '../../lib/number'
import { computeInvestmentMovement } from '../../scripts/investment-movements'
import type { InvestmentSide, PendingMovement, TransactionType } from '../../scripts/types'
import { monthFromISO, todayISO } from '../../scripts/utils'
import { useFinancialStateStore } from '../../stores/financial-state'
import { useMovementsStore } from '../../stores/movements'
import { useRecurringStore } from '../../stores/recurring'
import { useUiStore } from '../../stores/ui'
import { ENTRY_TYPES } from './entry-types'

// «Apuntar» sheet of the new design (DESIGN.md, «Hoja / panel de alta»): a
// side panel from the `frame:` breakpoint up, a bottom sheet below it. Saving
// goes through the movements store, so the validations and the toast errors
// are the ones of the old panel. Every opening starts empty and at the top.
//
// Opened on a pending movement (from «Por confirmar») it is «Editar y
// confirmar»: the form starts with the pending movement's data and saving
// confirms it with the changes in one step, as the old pending panel does. An
// investment pending movement also shows its operation (symbol, units, price,
// fees), since there is no other place to change it before confirming.
const EXIT_MS = 200
const DRAG_CLOSE_RATIO = 0.3
const DRAG_CLOSE_VELOCITY = 0.11

const { open, pending, closeEntrySheet, takeReturnFocus } = useEntrySheet()
const movementsStore = useMovementsStore()
const recurringStore = useRecurringStore()
const financialStateStore = useFinancialStateStore()
const { formatMoney } = useMoneyFormatter()
const uiStore = useUiStore()
const { showToast } = useToast()
const { navigateTo } = useSectionNavigation()

const dialog = useTemplateRef<HTMLDialogElement>('dialog')
const scrollArea = useTemplateRef<HTMLElement>('scrollArea')
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
  side: 'buy' as InvestmentSide,
  symbol: '',
  units: '',
  unitPrice: '',
  fee: '',
  time: '',
})

const editing = computed(() => pending.value !== null)
const isSaving = computed(() => form.type === 'saving')
const showOperation = computed(() => editing.value && form.type === 'investment')
const monthOptions = ALL_MONTHS.map((month) => ({ value: month, label: formatMonthName(month) }))
const SIDE_OPTIONS: ReadonlyArray<{ value: InvestmentSide; label: string }> = [
  { value: 'buy', label: 'Compra' },
  { value: 'sell', label: 'Venta' },
]
const accountOptions = computed(() =>
  movementsStore.accounts.map((account) => ({ value: account.id, label: account.name })),
)
const assetOptions = computed(() =>
  financialStateStore.investmentAssets.map((asset) => ({ value: asset.id, label: asset.name })),
)
// The amount an investment operation records: gross for a purchase, net of
// fees for a sale. The store recomputes it with the same function.
const investmentTotal = computed(() => {
  const operation = computeInvestmentMovement({
    side: form.side,
    symbol: form.symbol,
    units: parseDecimal(form.units) || 0,
    unitPrice: parseDecimal(form.unitPrice) || 0,
    fee: parseDecimal(form.fee) || 0,
  })
  return Math.abs(operation.signedAmount)
})
// A saving never lands in the account it leaves.
const destinationOptions = computed(() =>
  accountOptions.value.filter((option) => option.value !== form.accountId),
)
const categoryOptions = computed(() => {
  const names = movementsStore.orderedCategories(form.type)
  // A pending movement keeps its category even if it is no longer in the list.
  const original = pending.value
  if (original && original.type === form.type && original.category) {
    if (!names.includes(original.category)) return [original.category, ...names]
  }
  return names.length ? names : ['Sin categoría']
})

// While the form is filled from a pending movement the watchers below stay
// quiet: they would replace the pending movement's own account and category.
let filling = false

watch(
  () => form.type,
  (type, previous) => {
    if (filling) return
    if (!categoryOptions.value.includes(form.category)) {
      form.category = categoryOptions.value[0] ?? ''
    }
    if (editing.value) adaptAccountToType(type, previous)
    ensureDestination()
  },
)
watch(() => form.accountId, ensureDestination)

// Editing a pending movement, an investment may sit in an investment asset and
// any other type only in a cash account. Leaving an investment keeps the
// figure its operation came to.
function adaptAccountToType(type: TransactionType, previous: TransactionType): void {
  const assets = assetOptions.value
  const accounts = accountOptions.value
  if (type === 'investment') {
    const known = [...assets, ...accounts].some((option) => option.value === form.accountId)
    if (!known) form.accountId = assets[0]?.value ?? accounts[0]?.value ?? ''
    return
  }
  if (previous === 'investment' && investmentTotal.value > 0) {
    form.amount = String(investmentTotal.value)
  }
  if (assets.some((option) => option.value === form.accountId)) {
    form.accountId = accounts[0]?.value ?? ''
  }
}

function ensureDestination(): void {
  if (filling || !isSaving.value) return
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

function fillFromPending(item: PendingMovement): void {
  filling = true
  form.type = item.type || 'expense'
  form.amount = String(item.amount)
  form.description = item.description
  form.category = item.category
  form.accountId = item.accountId
  form.destinationAccountId = item.destinationAccountId ?? ''
  form.date = item.occurrenceDate
  onDateChange()
  form.side = item.side ?? 'buy'
  form.symbol = item.symbol ?? ''
  form.units = String(item.units ?? 0)
  form.unitPrice = String(item.unitPrice ?? 0)
  form.fee = String(item.fee ?? 0)
  form.time = item.time ?? ''
  // The type watcher runs in the next flush; it must still see the flag.
  void nextTick(() => (filling = false))
}

function save(): void {
  if (pending.value) return confirmPending(pending.value.id)
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

function confirmPending(id: string): void {
  if (!recurringStore.openPendingMovements.some((item) => item.id === id)) {
    showToast('Este movimiento ya no está por confirmar.')
    closeEntrySheet()
    return
  }
  const amount = parseDecimal(form.amount)
  const confirmed = recurringStore.confirmPending(id, {
    type: form.type,
    date: form.date,
    accountId: form.accountId,
    destinationAccountId: form.destinationAccountId,
    category: form.category,
    description: form.description,
    amount: Number.isFinite(amount) ? amount : 0,
    symbol: form.symbol,
    side: form.side,
    units: parseDecimal(form.units) || 0,
    unitPrice: parseDecimal(form.unitPrice) || 0,
    fee: parseDecimal(form.fee) || 0,
    time: form.time,
  })
  if (!confirmed) {
    showToast(
      showOperation.value
        ? 'Revisa la descripción, la fecha, el símbolo, los títulos y el precio.'
        : 'Revisa la descripción, la fecha y que el importe sea mayor que 0.',
    )
    return
  }
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
  // Always empty (or the pending movement's data), even when reopened while
  // the exit animation still runs.
  if (pending.value) fillFromPending(pending.value)
  else resetForm()
  const returnTo = takeReturnFocus()
  if (!element.open) {
    opener =
      returnTo ?? (document.activeElement instanceof HTMLElement ? document.activeElement : null)
    element.showModal?.()
  } else if (returnTo) {
    opener = returnTo
  }
  if (scrollArea.value) scrollArea.value.scrollTop = 0
  void nextTick(() => {
    const first = amountInput.value ?? scrollArea.value?.querySelector<HTMLElement>('input')
    first?.focus({ preventScroll: true })
  })
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
  const element = dialog.value
  if (!element) return
  element.style.transition = animated ? 'transform 320ms var(--ease-drawer)' : 'none'
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
  const height = dialog.value?.offsetHeight ?? 0
  dragStart = null
  lastMove = null
  if (delta > height * DRAG_CLOSE_RATIO || velocity > DRAG_CLOSE_VELOCITY) {
    closeEntrySheet()
  } else {
    setOffset(0, true)
  }
}

const fieldClass =
  'min-w-0 bg-panel border-ctrl-line text-text outline-accent rounded-field min-h-[46px] w-full border px-3.5 text-[16px] font-bold focus-visible:outline-2 focus-visible:outline-offset-2'
const labelClass = 'text-muted grid min-w-0 gap-1.5 text-[13px] font-bold'
</script>

<template>
  <dialog
    id="neon-entry-sheet"
    ref="dialog"
    class="neon-entry bg-panel text-text rounded-t-sheet shadow-sheet frame:m-0 frame:ms-auto frame:h-dvh frame:max-h-dvh frame:w-[380px] frame:rounded-none frame:border-s frame:border-line frame:shadow-float motion-safe:open:animate-sheet-in mx-auto mbs-auto mbe-0 max-h-[88%] w-full max-w-140 flex-col overflow-hidden p-0 backdrop:bg-[oklch(0%_none_none/0.55)] open:flex"
    aria-labelledby="neon-entry-title"
    @cancel="onCancel"
    @click="onScrimClick"
  >
    <div class="flex min-h-0 min-w-0 flex-1 flex-col">
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
          <div class="grid min-w-0 gap-1">
            <p v-if="editing" class="text-muted text-label tracking-label font-extrabold uppercase">
              Por confirmar
            </p>
            <h2
              id="neon-entry-title"
              class="font-display text-h1-detail tracking-h1 leading-[1.15] font-bold"
            >
              {{ editing ? 'Editar y confirmar' : 'Apuntar' }}
            </h2>
          </div>
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
        class="frame:px-6 grid min-h-0 min-w-0 flex-1 grid-cols-[minmax(0,1fr)] content-start gap-4 overflow-y-auto overscroll-contain px-4 pbe-[calc(22px+env(safe-area-inset-bottom,0px))]"
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

        <label v-if="!showOperation" class="grid grid-cols-[minmax(0,1fr)] gap-1.5">
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
            :placeholder="editing ? '' : 'Opcional'"
            :class="fieldClass"
          />
        </label>

        <div class="grid grid-cols-[repeat(2,minmax(0,1fr))] gap-3">
          <label :class="labelClass">
            Categoría
            <select v-model="form.category" name="category" :class="fieldClass">
              <option v-for="name in categoryOptions" :key="name" :value="name">{{ name }}</option>
            </select>
          </label>
          <label :class="labelClass">
            {{ isSaving ? 'Cuenta origen' : 'Cuenta' }}
            <select v-model="form.accountId" name="accountId" :class="fieldClass">
              <template v-if="showOperation">
                <optgroup v-if="assetOptions.length" label="Activos de inversión">
                  <option v-for="option in assetOptions" :key="option.value" :value="option.value">
                    {{ option.label }}
                  </option>
                </optgroup>
                <optgroup v-if="accountOptions.length" label="Cuentas de efectivo">
                  <option
                    v-for="option in accountOptions"
                    :key="option.value"
                    :value="option.value"
                  >
                    {{ option.label }}
                  </option>
                </optgroup>
              </template>
              <template v-else>
                <option v-for="option in accountOptions" :key="option.value" :value="option.value">
                  {{ option.label }}
                </option>
              </template>
            </select>
          </label>
          <label v-if="isSaving" :class="[labelClass, 'col-span-full']">
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
          <label :class="[labelClass, editing && 'col-span-full']">
            Fecha
            <input
              v-model="form.date"
              name="date"
              type="date"
              :class="fieldClass"
              @change="onDateChange"
            />
          </label>
          <label v-if="!editing" :class="labelClass">
            Cuenta en el mes
            <select v-model="form.month" name="month" :class="fieldClass">
              <option v-for="option in monthOptions" :key="option.value" :value="option.value">
                {{ option.label }}
              </option>
            </select>
          </label>
        </div>

        <fieldset
          v-if="showOperation"
          class="grid min-w-0 grid-cols-[repeat(2,minmax(0,1fr))] gap-3"
          data-pending-operation
        >
          <legend :class="[labelClass, 'mbe-1.5']">Operación</legend>
          <div
            class="bg-panel2 rounded-pill col-span-full flex gap-[3px] p-[3px]"
            role="radiogroup"
            aria-label="Operación"
          >
            <button
              v-for="option in SIDE_OPTIONS"
              :key="option.value"
              type="button"
              role="radio"
              :aria-checked="form.side === option.value"
              class="outline-accent rounded-pill min-h-9 flex-1 px-2 text-[14px] font-extrabold focus-visible:outline-2 focus-visible:outline-offset-2"
              :class="form.side === option.value ? 'bg-sel-bg text-sel-text' : 'text-soft'"
              @click="form.side = option.value"
            >
              {{ option.label }}
            </button>
          </div>
          <label :class="labelClass">
            Símbolo
            <input v-model="form.symbol" name="symbol" placeholder="VWCE" :class="fieldClass" />
          </label>
          <label :class="labelClass">
            Hora
            <input v-model="form.time" name="time" type="time" :class="fieldClass" />
          </label>
          <label :class="labelClass">
            Títulos
            <input v-model="form.units" name="units" inputmode="decimal" :class="fieldClass" />
          </label>
          <label :class="labelClass">
            Precio por título
            <input
              v-model="form.unitPrice"
              name="unitPrice"
              inputmode="decimal"
              :class="fieldClass"
            />
          </label>
          <label :class="labelClass">
            Comisiones
            <input v-model="form.fee" name="fee" inputmode="decimal" :class="fieldClass" />
          </label>
          <div class="grid min-w-0 content-end gap-1.5">
            <span class="text-muted text-[13px] font-bold">Importe total</span>
            <output
              class="font-display flex min-h-[46px] items-center text-[18px] font-bold tabular-nums"
              aria-live="polite"
              data-pending-total
            >
              {{ formatMoney(investmentTotal) }}
            </output>
          </div>
        </fieldset>

        <p v-if="!editing && form.type === 'investment'" class="text-muted text-[13px]">
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
            {{ editing ? 'Guardar y confirmar' : 'Guardar' }}
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
  .neon-entry[data-closing] {
    animation: neon-entry-out 200ms var(--ease-out) forwards;
  }
}

@keyframes neon-entry-out {
  to {
    opacity: 0;
    transform: translateY(48px);
  }
}
</style>
