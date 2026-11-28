<script setup lang="ts">
import {
  computed,
  nextTick,
  onBeforeUnmount,
  onMounted,
  reactive,
  ref,
  useTemplateRef,
  watch,
} from 'vue'

import { useEntrySheet } from '../../composables/useEntrySheet'
import { useMoneyFormatter } from '../../composables/useMoneyFormatter'
import { useSectionNavigation } from '../../composables/useSectionNavigation'
import { useToast } from '../../composables/useToast'
import { formatMonthName, formatShortDate } from '../../lib/format'
import { ALL_MONTHS, monthFromDate } from '../../lib/month'
import { parseDecimal } from '../../lib/number'
import { computeInvestmentMovement } from '../../scripts/investment-movements'
import type { InvestmentSide, PendingMovement, TransactionType } from '../../scripts/types'
import { monthFromISO, todayISO } from '../../scripts/utils'
import { useFinancialStateStore } from '../../stores/financial-state'
import { useMovementsStore } from '../../stores/movements'
import { useRecurringStore } from '../../stores/recurring'
import { useUiStore } from '../../stores/ui'
import { categoryIcon } from '../ui/category-icons'
import { ACCOUNT_ICON, ENTRY_FIELD_CLASS, ENTRY_LABEL_CLASS, ENTRY_TYPES } from './entry-types'
import NeonEntryDatePicker from './NeonEntryDatePicker.vue'
import NeonEntryInvestment from './NeonEntryInvestment.vue'
import NeonEntryPicker from './NeonEntryPicker.vue'

// New movements open in the mini modal. Pending movements keep their review
// sheet, including the investment operation that can be changed before confirming.
const EXIT_MS = 200
const DRAG_CLOSE_RATIO = 0.3
const DRAG_CLOSE_VELOCITY = 0.11

const { open, pending, investmentPreset, closeEntrySheet, takeReturnFocus } = useEntrySheet()
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
const timing = useTemplateRef<HTMLDetailsElement>('timing')

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
// A new movement started from Inversión can only be an investment: the sheet
// opens on it with no type selector. Set each time the sheet opens.
const investmentOnly = ref(false)
const investmentForm = useTemplateRef<InstanceType<typeof NeonEntryInvestment>>('investmentForm')
// Each opening mounts the investment form afresh, so it starts empty.
const openings = ref(0)
// On a phone a new movement takes its amount from the sheet's own keypad (no
// system keyboard): a bottom sheet with the type, the amount, pills for the
// account, the category and the date, and the keypad. The desktop keeps the
// mini modal; an investment from Inversión keeps its own form.
const narrow = ref(false)
const isPad = computed(() => narrow.value && !editing.value && !investmentOnly.value)
// On a phone every form opens as a bottom sheet; only the desktop keeps the mini modal.
const sheet = computed(() => editing.value || narrow.value)
const amountOutput = useTemplateRef<HTMLElement>('amountOutput')
const PAD_KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', ',', '0', '⌫'] as const
const SAVE_LABEL: Record<TransactionType, string> = {
  expense: 'Guardar gasto',
  income: 'Guardar ingreso',
  saving: 'Guardar ahorro',
  investment: 'Guardar inversión',
}
const amountSign = computed(() =>
  form.type === 'expense' ? '−' : form.type === 'income' ? '+' : '',
)
const amountTone = computed(() =>
  form.type === 'expense' ? 'text-loss' : form.type === 'income' ? 'text-gain' : 'text-text',
)
const groupInteger = new Intl.NumberFormat('es-ES', { maximumFractionDigits: 0 })
/** The typed amount with its sign and thousands grouped, as the keypad shows it. */
const amountText = computed(() => {
  if (!form.amount) return '0'
  const [integer = '', decimals] = form.amount.split(',')
  const grouped = groupInteger.format(Number(integer || 0))
  return `${amountSign.value}${grouped}${decimals === undefined ? '' : `,${decimals}`}`
})
// Unbounded's digits take about 0.78em; separators about 0.35em; the currency
// and its gap about 0.55em. The figure fills at most the sheet's width.
const amountSize = computed(() => {
  const width = [...amountText.value].reduce(
    (total, char) => total + ('.,'.includes(char) ? 0.35 : 0.78),
    0.55,
  )
  return `min(3.5rem, ${(100 / width).toFixed(2)}cqi)`
})

/** A key of the keypad: a digit, the decimal comma or erase. Two decimals at most. */
function press(key: string): void {
  const current = form.amount
  if (key === '⌫') {
    form.amount = current.slice(0, -1)
    return
  }
  if (key === ',') {
    if (!current.includes(',')) form.amount = `${current || '0'},`
    return
  }
  const [whole, decimals] = current.split(',')
  if (decimals !== undefined && decimals.length >= 2) return
  if (decimals === undefined && whole.replace(/^0+/, '').length >= 7) return
  form.amount = current === '0' ? key : current + key
}

function onPadKey(event: KeyboardEvent): void {
  if (!isPad.value || event.target instanceof HTMLInputElement) return
  if (event.metaKey || event.ctrlKey || event.altKey) return
  const key = event.key === 'Backspace' ? '⌫' : event.key === '.' ? ',' : event.key
  if (!(PAD_KEYS as readonly string[]).includes(key)) return
  event.preventDefault()
  press(key)
}

const typeIndex = computed(() => ENTRY_TYPES.findIndex((option) => option.value === form.type))
const dateSummary = computed(() => {
  const date = form.date || todayISO()
  const label = date === todayISO() ? 'Hoy' : formatShortDate(date)
  return monthFromISO(date) === form.month ? label : `${label} · ${formatMonthName(form.month)}`
})
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

const categoryChoices = computed(() =>
  [...categoryOptions.value]
    .sort((a, b) => a.localeCompare(b, 'es'))
    .map((label) => ({
      label,
      value: label,
      icon: categoryIcon(form.type, label),
    })),
)

const recentCategoryChoices = computed(() => {
  const lastUse = new Map<string, string>()
  for (const movement of financialStateStore.transactions) {
    if (movement.type !== form.type) continue
    const key = `${movement.date} ${movement.time ?? ''} ${movement.createdAt ?? ''}`
    if (key > (lastUse.get(movement.category) ?? '')) lastUse.set(movement.category, key)
  }
  return categoryChoices.value
    .filter(({ value }) => lastUse.has(value))
    .sort((a, b) => (lastUse.get(b.value) ?? '').localeCompare(lastUse.get(a.value) ?? ''))
    .slice(0, 3)
})

function pickDate(date: string): void {
  form.date = date
  onDateChange()
}

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
  form.type = investmentOnly.value ? 'investment' : 'expense'
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
  if (investmentOnly.value) {
    if (investmentForm.value?.save()) closeEntrySheet()
    return
  }
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
  navigateTo('investment')
}

// --- Opening and closing -------------------------------------------------

let opener: HTMLElement | null = null
let closeTimer: ReturnType<typeof setTimeout> | undefined
let resizeObserver: ResizeObserver | undefined

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(value, max))

// The mini modal (desktop) and the bottom sheet (phone) grow out of what opened
// them (the FAB, Apuntar, Comprar…): the box is clipped to that button, in the
// button's colour, and opens to the full surface as the colour turns to the
// panel and the content fades in. Closing runs it back into the button. A sheet
// dragged down leaves by its edge instead. The side panel has no morph.
const MORPH_EASE = 'cubic-bezier(0.2, 0, 0, 1)'
// Durations mirror DESIGN.md («Hoja / panel de alta»); the no-opener fallback
// keyframes at the end of the stylesheet carry the mini modal's 220/180ms too.
const MORPH_MS = { mini: { in: 220, out: 180 }, sheet: { in: 380, out: 260 } }
let morphing: Animation[] = []

function morphKeyframes(
  element: HTMLElement,
): { shape: Keyframe[]; colour: Keyframe[]; content: Keyframe[] } | null {
  const sidePanel = sheet.value && !narrow.value
  // Focus can rest on the page itself: that is no button to grow from.
  const origin = opener === document.body || opener === document.documentElement ? null : opener
  if (sidePanel || !origin?.isConnected) return null
  const from = origin.getBoundingClientRect()
  if (!from.width || !from.height) return null
  const box = element.getBoundingClientRect()
  const openerStyle = getComputedStyle(origin)
  const radius = Math.min(parseFloat(openerStyle.borderTopLeftRadius) || 0, from.height / 2)
  const surfaceRadius = parseFloat(getComputedStyle(element).borderTopLeftRadius) || 0
  const panel = getComputedStyle(element).backgroundColor
  const colour = /rgba?\(.*,\s*0\)$|transparent/.test(openerStyle.backgroundColor)
    ? panel
    : openerStyle.backgroundColor
  // Bounds are viewport pixels; clip-path lengths are scaled by the frame's zoom.
  const zoom = Number(getComputedStyle(element).getPropertyValue('--ui-zoom')) || 1
  const inset = (distance: number) => `${distance / zoom}px`
  const start = `inset(${inset(from.top - box.top)} ${inset(box.right - from.right)} ${inset(box.bottom - from.bottom)} ${inset(from.left - box.left)} round ${radius}px)`
  const end = `inset(0px 0px 0px 0px round ${surfaceRadius}px ${surfaceRadius}px 0px 0px)`
  // The mini modal opens beside its opener, not over it: there is nothing of it
  // under the button to clip, so it grows from the button's rectangle by moving
  // and scaling (from the top left corner, see `.entry-mini`).
  const grow = `translate(${(from.left - box.left) / zoom}px, ${(from.top - box.top) / zoom}px) scale(${from.width / box.width}, ${from.height / box.height})`
  return {
    shape: sheet.value
      ? [{ clipPath: start }, { clipPath: end }]
      : [{ transform: grow }, { transform: 'none' }],
    // Linear, apart from the shape's easing: the colour turns while it grows.
    colour: [
      { backgroundColor: colour },
      { backgroundColor: panel, offset: 0.4 },
      { backgroundColor: panel },
    ],
    content: [{ opacity: 0 }, { opacity: 0, offset: 0.3 }, { opacity: 1 }],
  }
}

function stopMorph(): void {
  morphing.forEach((animation) => animation.cancel())
  morphing = []
}

/** Grows the sheet out of its opener; false when there is nothing to grow from. */
function morphIn(element: HTMLElement): boolean {
  stopMorph()
  if (reducedMotion()) return false
  // Marked first so that the sheet's own slide-up animation (`animate-sheet-in`)
  // is off when the box is measured: it would offset it by 48px.
  element.setAttribute('data-morph', '')
  const frames = morphKeyframes(element)
  if (!frames) {
    element.removeAttribute('data-morph')
    return false
  }
  const duration = MORPH_MS[sheet.value ? 'sheet' : 'mini'].in
  morphing = [
    element.animate(frames.shape, { duration, easing: MORPH_EASE }),
    element.animate(frames.colour, { duration, easing: 'linear' }),
    ...[...element.children].map((child) =>
      child.animate(frames.content, { duration, easing: 'linear' }),
    ),
  ]
  return true
}

/** Runs the sheet back into its opener, then `done`; false when it can't. */
function morphOut(element: HTMLElement, done: () => void): boolean {
  if (reducedMotion() || element.style.transform) return false
  const frames = morphKeyframes(element)
  if (!frames) return false
  stopMorph()
  element.setAttribute('data-morph', '')
  const options = {
    duration: MORPH_MS[sheet.value ? 'sheet' : 'mini'].out,
    easing: 'cubic-bezier(0.4, 0, 0.2, 1)',
    fill: 'forwards',
  } as const
  const shape = element.animate([...frames.shape].reverse(), options)
  morphing = [
    shape,
    element.animate([...frames.colour].reverse(), { ...options, easing: 'linear' }),
    ...[...element.children].map((child) =>
      child.animate([{ opacity: 1 }, { opacity: 0, offset: 0.45 }, { opacity: 0 }], {
        ...options,
        easing: 'linear',
      }),
    ),
  ]
  shape.finished.then(done, () => {})
  return true
}

function placeMiniModal(): void {
  const element = dialog.value
  if (!element?.open || sheet.value) return

  const viewport = window.visualViewport
  const viewportLeft = viewport?.offsetLeft ?? 0
  const viewportTop = viewport?.offsetTop ?? 0
  const viewportWidth = viewport?.width ?? document.documentElement.clientWidth
  const viewportHeight = viewport?.height ?? document.documentElement.clientHeight
  // Trigger bounds and the visual viewport use viewport pixels; style lengths
  // are scaled by the Neon frame's desktop zoom.
  const zoom = Number(getComputedStyle(element).getPropertyValue('--ui-zoom')) || 1
  const gutter = 12
  element.style.setProperty('--entry-max-height', `${(viewportHeight - 2 * gutter) / zoom}px`)
  const width = element.offsetWidth * zoom
  const height = element.offsetHeight * zoom
  const trigger = opener?.getBoundingClientRect()
  const anchored = trigger && trigger.width > 0 && trigger.height > 0
  const viewportBottom = viewportTop + viewportHeight
  const below = anchored && trigger.bottom + gutter + height <= viewportBottom - gutter
  const top = anchored
    ? below
      ? trigger.bottom + gutter
      : trigger.top - height - gutter
    : viewportTop + (viewportHeight - height) / 2
  const left = anchored ? trigger.right - width : viewportLeft + (viewportWidth - width) / 2
  const x = clamp(left, viewportLeft + gutter, viewportLeft + viewportWidth - width - gutter)
  const y = clamp(top, viewportTop + gutter, viewportBottom - height - gutter)
  element.style.setProperty('--entry-x', `${x / zoom}px`)
  element.style.setProperty('--entry-y', `${y / zoom}px`)
  element.style.setProperty('--entry-from-x', anchored ? `${(trigger.left - x) / zoom}px` : '0px')
  element.style.setProperty('--entry-from-y', anchored ? `${(trigger.top - y) / zoom}px` : '0px')
  element.style.setProperty('--entry-from-width', anchored ? String(trigger.width / width) : '0.97')
  element.style.setProperty(
    '--entry-from-height',
    anchored ? String(trigger.height / height) : '0.97',
  )
}

function reducedMotion(): boolean {
  return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false
}

function present(): void {
  const element = dialog.value
  if (!element) return
  clearTimeout(closeTimer)
  element.removeAttribute('data-closing')
  element.removeAttribute('data-entering')
  element.removeAttribute('data-leaving')
  resetDrag()
  // Always empty (or the pending movement's data), even when reopened while
  // the exit animation still runs.
  investmentOnly.value = !pending.value && uiStore.ui.activeSection === 'investment'
  narrow.value = !window.matchMedia('(width >= 61.3125rem)').matches
  openings.value++
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
  if (timing.value) timing.value.open = false
  element.removeAttribute('data-morph')
  stopMorph()
  void nextTick(() => {
    // The form was just reset: measure once the DOM shows it (classes and
    // height of the new presentation), not the previous one.
    if (!sheet.value) placeMiniModal()
    // Without an opener the mini modal fades in centred (`data-entering`).
    if (!morphIn(element) && !sheet.value) element.setAttribute('data-entering', '')
    // The keypad needs no field: the focus rests on the amount, and no system
    // keyboard opens.
    if (isPad.value) return amountOutput.value?.focus({ preventScroll: true })
    // An investment opened from an asset is already half filled: the first empty field.
    const first =
      amountInput.value ??
      [...(scrollArea.value?.querySelectorAll<HTMLInputElement>('input') ?? [])].find(
        (input) => !input.value,
      ) ??
      scrollArea.value?.querySelector<HTMLElement>('input')
    first?.focus({ preventScroll: true })
    if (!editing.value) amountInput.value?.select()
  })
}

function dismiss(): void {
  const element = dialog.value
  if (!element?.open) return
  const finish = () => {
    element.removeAttribute('data-closing')
    element.removeAttribute('data-entering')
    element.removeAttribute('data-morph')
    element.removeAttribute('data-leaving')
    stopMorph()
    element.close()
    resetDrag()
    opener?.focus()
    opener = null
  }
  if (reducedMotion()) return finish()
  element.setAttribute('data-leaving', '')
  if (morphOut(element, finish)) return
  element.setAttribute('data-closing', '')
  closeTimer = setTimeout(finish, EXIT_MS)
}

watch(open, (value) => void nextTick(() => (value ? present() : dismiss())))
onMounted(() => {
  resizeObserver = new ResizeObserver(placeMiniModal)
  if (dialog.value) resizeObserver.observe(dialog.value)
  window.addEventListener('resize', placeMiniModal)
  window.visualViewport?.addEventListener('resize', placeMiniModal)
  window.visualViewport?.addEventListener('scroll', placeMiniModal)
  if (open.value) present()
})

onBeforeUnmount(() => {
  clearTimeout(closeTimer)
  resizeObserver?.disconnect()
  window.removeEventListener('resize', placeMiniModal)
  window.visualViewport?.removeEventListener('resize', placeMiniModal)
  window.visualViewport?.removeEventListener('scroll', placeMiniModal)
})

function onCancel(event: Event): void {
  // Escape: the shared flag drives the close so state and dialog stay in step.
  event.preventDefault()
  closeEntrySheet()
}

function onScrimClick(event: MouseEvent): void {
  const element = dialog.value
  if (!element || event.target !== element) return
  const bounds = element.getBoundingClientRect()
  if (
    event.clientX < bounds.left ||
    event.clientX > bounds.right ||
    event.clientY < bounds.top ||
    event.clientY > bounds.bottom
  )
    closeEntrySheet()
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

const fieldClass = ENTRY_FIELD_CLASS
const labelClass = ENTRY_LABEL_CLASS
</script>

<template>
  <dialog
    id="neon-entry-sheet"
    ref="dialog"
    class="neon-entry bg-panel text-text flex-col overflow-clip p-0 open:flex"
    :class="
      sheet
        ? 'entry-review rounded-t-sheet shadow-sheet frame:m-0 frame:ms-auto frame:h-(--ui-dvh) frame:max-h-(--ui-dvh) frame:w-[380px] frame:rounded-none frame:border-s frame:border-line frame:shadow-float motion-safe:max-frame:open:animate-sheet-in motion-safe:frame:open:animate-side-in mx-auto mbs-auto mbe-0 max-h-[88%] w-full max-w-140 backdrop:bg-[oklch(0%_none_none/0.55)]'
        : 'entry-mini rounded-popover shadow-float backdrop:bg-[oklch(0%_none_none/0.28)]'
    "
    aria-labelledby="neon-entry-title"
    @cancel="onCancel"
    @click="onScrimClick"
    @keydown="onPadKey"
  >
    <div class="flex min-h-0 min-w-0 flex-1 flex-col">
      <div
        class="shrink-0 px-4 pbs-3"
        :class="sheet && 'frame:px-6 frame:pbs-6 touch-none'"
        @pointerdown="onDragStart"
        @pointermove="onDragMove"
        @pointerup="onDragEnd"
        @pointercancel="onDragEnd"
      >
        <div
          v-if="sheet"
          ref="grip"
          class="bg-ctrl-line frame:hidden rounded-pill mx-auto mbe-3.5 h-1 w-9"
          aria-hidden="true"
        ></div>
        <header
          class="flex items-center justify-between gap-3"
          :class="isPad ? 'sr-only' : 'mbe-3'"
        >
          <div class="grid min-w-0 gap-1">
            <p v-if="editing" class="text-muted text-label tracking-label font-extrabold uppercase">
              Por confirmar
            </p>
            <h2
              id="neon-entry-title"
              :class="
                editing
                  ? 'font-display text-h1-detail tracking-h1 leading-[1.15] font-bold'
                  : 'text-[17px] leading-tight font-extrabold tracking-tight'
              "
            >
              {{
                editing
                  ? 'Editar y confirmar'
                  : investmentOnly
                    ? investmentPreset?.symbol
                      ? `${investmentForm?.selling ? 'Vender' : 'Comprar'} ${investmentPreset.symbol}`
                      : 'Nueva inversión'
                    : 'Nuevo movimiento'
              }}
            </h2>
          </div>
          <button
            v-if="!isPad"
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
        class="grid min-h-0 min-w-0 flex-1 grid-cols-[minmax(0,1fr)] content-start overflow-y-auto overscroll-contain px-4"
        :class="
          editing
            ? 'frame:px-6 gap-4 pbe-[calc(22px+env(safe-area-inset-bottom,0px))]'
            : sheet
              ? 'gap-3.5 pbe-[calc(16px+env(safe-area-inset-bottom,0px))]'
              : 'gap-3 pbe-4'
        "
        autocomplete="off"
        novalidate
        @submit.prevent="save"
      >
        <div
          v-if="!investmentOnly && !isPad"
          class="relative flex gap-1 p-1"
          :class="editing ? 'bg-panel2 rounded-pill' : 'bg-bg rounded-field'"
          :style="editing ? undefined : { '--entry-type-index': typeIndex }"
          role="radiogroup"
          aria-label="Tipo de movimiento"
        >
          <span
            v-if="!editing"
            class="pointer-events-none absolute inset-1 grid grid-cols-4 gap-1"
            aria-hidden="true"
          >
            <span class="entry-type-indicator bg-accent/12 rounded-lg" />
          </span>
          <button
            v-for="option in ENTRY_TYPES"
            :key="option.value"
            type="button"
            role="radio"
            :aria-checked="form.type === option.value"
            :data-entry-type="option.value"
            class="relative min-w-0 flex-1 font-extrabold active:brightness-90"
            :class="[
              editing
                ? 'outline-accent rounded-pill min-h-9 px-2 text-[14px] focus-visible:outline-2 focus-visible:outline-offset-2'
                : 'grid min-h-15 place-content-center justify-items-center gap-1.5 rounded-lg px-0.5 py-2 text-[12px] leading-tight underline-offset-4 focus-visible:underline focus-visible:outline-2 focus-visible:outline-transparent',
              form.type === option.value
                ? editing
                  ? 'bg-sel-bg text-sel-text'
                  : 'text-text'
                : 'text-soft',
            ]"
            @click="form.type = option.value"
          >
            <svg
              v-if="!editing"
              class="size-5"
              :class="form.type === option.value ? 'text-accent-text' : 'text-muted'"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="1.9"
              stroke-linecap="round"
              stroke-linejoin="round"
              aria-hidden="true"
            >
              <path :d="categoryIcon(option.value, '')" />
            </svg>
            {{ option.label }}
          </button>
        </div>

        <template v-if="isPad">
          <div class="flex justify-center gap-1" role="radiogroup" aria-label="Tipo de movimiento">
            <button
              v-for="option in ENTRY_TYPES"
              :key="option.value"
              type="button"
              role="radio"
              :aria-checked="form.type === option.value"
              :data-entry-type="option.value"
              class="rounded-pill outline-accent min-h-9 px-3 text-[13px] font-extrabold focus-visible:outline-2 focus-visible:outline-offset-2 motion-safe:transition-colors motion-safe:duration-160"
              :class="form.type === option.value ? 'bg-sel-bg text-sel-text' : 'text-muted'"
              @click="form.type = option.value"
            >
              {{ option.label }}
            </button>
          </div>

          <!-- The figure shrinks with its length so a big amount still fits the sheet. -->
          <div class="@container">
            <p
              ref="amountOutput"
              tabindex="-1"
              class="font-display flex items-baseline justify-center gap-2 py-1 leading-none font-bold tracking-[-0.04em] whitespace-nowrap tabular-nums outline-none"
              :class="form.amount ? amountTone : 'text-faint'"
              :style="{ fontSize: amountSize }"
              role="status"
              aria-live="polite"
              :aria-label="`Importe: ${form.amount || '0'} €`"
              data-entry-amount
            >
              <span>{{ amountText }}</span>
              <span class="text-muted text-[0.45em]" aria-hidden="true">
                {{ financialStateStore.currency === 'EUR' ? '€' : financialStateStore.currency }}
              </span>
            </p>
          </div>

          <!-- Category, accounts, date, month and note, all at hand as blocks. The
               category takes the whole width: it is the longest value, so it wraps. -->
          <div class="grid grid-cols-2 gap-1.5">
            <NeonEntryPicker
              v-model="form.category"
              tile
              class="col-span-2"
              label="Categoría"
              searchable
              :icon="categoryIcon(form.type, form.category)"
              :options="categoryChoices"
              :recent="recentCategoryChoices"
            />
            <NeonEntryPicker
              v-model="form.accountId"
              tile
              :icon="ACCOUNT_ICON"
              :label="isSaving ? 'Cuenta origen' : 'Cuenta'"
              :options="accountOptions"
            />
            <NeonEntryPicker
              v-if="isSaving"
              v-model="form.destinationAccountId"
              tile
              :icon="ACCOUNT_ICON"
              label="Cuenta destino"
              :options="destinationOptions"
            />
            <NeonEntryDatePicker
              v-model:accounting-month="form.month"
              tile
              :text="dateSummary"
              :months="monthOptions"
              :model-value="form.date"
              @update:model-value="pickDate"
            />
            <label
              class="bg-panel2 flex min-h-[54px] min-w-0 cursor-text items-center gap-2.5 rounded-[16px] px-3 py-2 focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-(--color-accent)"
              :class="isSaving ? '' : 'col-span-2'"
            >
              <span
                class="bg-panel text-soft grid size-[34px] shrink-0 place-items-center rounded-[11px]"
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
                  <path d="M4 20h4L19 9l-4-4L4 16v4zM13 7l4 4" />
                </svg>
              </span>
              <span class="grid min-w-0 flex-1 gap-0.5">
                <span class="text-muted text-[12px] leading-none font-bold">Nota</span>
                <input
                  v-model="form.description"
                  name="description"
                  maxlength="140"
                  placeholder="Opcional"
                  class="text-text placeholder:text-faint w-full min-w-0 bg-transparent text-[15px] leading-tight font-extrabold outline-none focus-visible:outline-none"
                />
              </span>
            </label>
          </div>

          <div class="grid grid-cols-3 gap-1.5" role="group" aria-label="Teclado del importe">
            <button
              v-for="key in PAD_KEYS"
              :key="key"
              type="button"
              class="bg-panel2 font-display outline-accent grid min-h-12 place-items-center rounded-[14px] text-[22px] font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 active:brightness-95 motion-safe:transition-transform motion-safe:duration-100 motion-safe:active:scale-[0.96]"
              :aria-label="key === '⌫' ? 'Borrar' : key === ',' ? 'Coma decimal' : key"
              @click="press(key)"
            >
              <svg
                v-if="key === '⌫'"
                class="size-6"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="1.9"
                stroke-linecap="round"
                stroke-linejoin="round"
                aria-hidden="true"
              >
                <path d="M21 5H9l-6 7 6 7h12zM17 9l-6 6M11 9l6 6" />
              </svg>
              <template v-else>{{ key }}</template>
            </button>
          </div>

          <button
            type="submit"
            class="bg-accent text-on-accent outline-text min-h-[52px] rounded-2xl px-3 text-[15px] font-extrabold focus-visible:outline-2 focus-visible:outline-offset-2 active:brightness-90"
          >
            {{ SAVE_LABEL[form.type] }}
          </button>
        </template>

        <NeonEntryInvestment
          v-if="investmentOnly"
          ref="investmentForm"
          :key="openings"
          :preset="investmentPreset"
        />

        <label
          v-if="!showOperation && !investmentOnly && !isPad"
          class="grid grid-cols-[minmax(0,1fr)] gap-1"
          :class="!editing && 'group bg-bg rounded-field px-3 py-2.5'"
        >
          <span :class="[labelClass, !editing && 'group-focus-within:text-accent-text']"
            >Importe</span
          >
          <span
            class="flex items-baseline gap-2"
            :class="editing && 'border-ctrl-line border-be-2 pbe-1.5'"
          >
            <input
              ref="amountInput"
              v-model="form.amount"
              name="amount"
              inputmode="decimal"
              placeholder="0,00"
              aria-label="Importe"
              class="font-display text-text placeholder:text-faint min-w-0 flex-1 rounded-sm bg-transparent text-[32px] leading-tight font-bold tracking-tight"
              :class="
                editing
                  ? 'outline-accent focus-visible:outline-2 focus-visible:outline-offset-2'
                  : 'caret-accent outline-2 outline-transparent'
              "
            />
            <span
              aria-hidden="true"
              class="font-display text-muted text-[20px] leading-tight font-bold"
            >
              {{ financialStateStore.currency === 'EUR' ? '€' : financialStateStore.currency }}
            </span>
          </span>
        </label>

        <label v-if="editing" :class="labelClass">
          Descripción
          <input
            v-model="form.description"
            name="description"
            maxlength="140"
            :placeholder="editing ? '' : 'Opcional'"
            :class="fieldClass"
          />
        </label>

        <div v-if="editing" class="grid grid-cols-[repeat(2,minmax(0,1fr))] gap-3">
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
          <label v-if="editing" :class="[labelClass, 'col-span-full']">
            Fecha
            <input
              v-model="form.date"
              name="date"
              type="date"
              :class="fieldClass"
              @change="onDateChange"
            />
          </label>
        </div>

        <template v-else-if="!investmentOnly && !isPad">
          <NeonEntryPicker
            v-model="form.accountId"
            :icon="ACCOUNT_ICON"
            :label="isSaving ? 'Cuenta origen' : 'Cuenta'"
            :options="accountOptions"
          />
          <NeonEntryPicker
            v-if="isSaving"
            v-model="form.destinationAccountId"
            :icon="ACCOUNT_ICON"
            label="Cuenta destino"
            :options="destinationOptions"
          />
          <NeonEntryPicker
            v-model="form.category"
            label="Categoría"
            searchable
            :icon="categoryIcon(form.type, form.category)"
            :options="categoryChoices"
            :recent="recentCategoryChoices"
          />
        </template>

        <label v-if="!editing && !investmentOnly && !isPad" :class="labelClass">
          Descripción
          <input
            v-model="form.description"
            name="description"
            maxlength="140"
            placeholder="Opcional"
            :class="fieldClass"
          />
        </label>

        <details
          v-if="!editing && !investmentOnly && !isPad"
          ref="timing"
          class="group border-line border-y"
        >
          <summary
            class="text-soft active:bg-panel2 flex min-h-11 cursor-pointer list-none items-center gap-2 rounded-sm text-[13px] font-bold underline-offset-4 focus-visible:underline focus-visible:outline-2 focus-visible:outline-transparent"
          >
            <span class="text-text">Fecha y mes contable</span>
            <span class="text-muted min-w-0 flex-1 text-end">{{ dateSummary }}</span>
            <svg
              class="size-4 shrink-0 group-open:rotate-180"
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
          </summary>
          <div class="grid grid-cols-2 gap-2 pbe-2">
            <NeonEntryDatePicker :model-value="form.date" @update:model-value="pickDate" />
            <NeonEntryPicker
              v-model="form.month"
              label="Cuenta en el mes"
              :options="monthOptions"
            />
          </div>
        </details>

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

        <p
          v-if="!editing && !investmentOnly && form.type === 'investment'"
          class="text-muted text-[13px]"
        >
          ¿Compras o vendes títulos? Regístralo en
          <a
            href="/inversion"
            class="text-accent-text font-extrabold underline-offset-2 hover:underline"
            @click.prevent="openInvestmentMovements"
            >Inversión › Movimientos</a
          >
          para guardar símbolo, títulos y precio.
        </p>

        <div v-if="editing" class="grid gap-2 pbs-2">
          <button
            type="submit"
            class="bg-accent text-on-accent font-display outline-text rounded-pill min-h-11 w-full border-0 px-[22px] text-[14px] font-bold focus-visible:outline-2 focus-visible:outline-offset-2 motion-safe:transition-transform motion-safe:duration-160 motion-safe:ease-out motion-safe:active:scale-[0.97]"
          >
            Guardar y confirmar
          </button>
          <button
            type="button"
            class="text-soft outline-accent rounded-pill min-h-11 w-full text-[14px] font-extrabold focus-visible:outline-2 focus-visible:outline-offset-2"
            @click="closeEntrySheet"
          >
            Cancelar
          </button>
        </div>
        <div v-else-if="!isPad" class="flex items-center gap-2 pbs-1">
          <button
            type="button"
            class="text-soft outline-accent active:bg-panel2 min-h-11 rounded-lg px-2.5 text-[14px] font-extrabold focus-visible:outline-2 focus-visible:outline-offset-2"
            @click="closeEntrySheet"
          >
            Cancelar
          </button>
          <button
            type="submit"
            class="bg-accent text-on-accent outline-text min-h-11 flex-1 rounded-xl px-3 text-[14px] font-extrabold focus-visible:outline-2 focus-visible:outline-offset-2 active:brightness-90"
          >
            {{
              !investmentOnly
                ? 'Guardar movimiento'
                : investmentForm?.selling
                  ? 'Guardar venta'
                  : 'Guardar compra'
            }}
          </button>
        </div>
      </form>
    </div>
  </dialog>
</template>

<style scoped>
.entry-mini {
  position: fixed;
  inset: auto;
  inset-inline-start: var(--entry-x, 12px);
  inset-block-start: var(--entry-y, 12px);
  inline-size: min(372px, calc((100vw - 24px) / var(--ui-zoom, 1)));
  max-block-size: var(--entry-max-height, 80dvb);
  margin: 0;
  transform-origin: 0 0;
}
.entry-mini summary::-webkit-details-marker {
  display: none;
}

.entry-type-indicator {
  transform: translateX(calc(var(--entry-type-index) * (100% + 0.25rem)));
}

@media (prefers-reduced-motion: no-preference) {
  .entry-type-indicator {
    transition: transform 220ms ease-in-out;
  }

  .entry-mini[data-entering] {
    animation: neon-mini-in 220ms var(--ease-out-expo);
    transform-origin: 0 0;
  }

  .entry-mini[data-closing] {
    animation: neon-mini-out 180ms var(--ease-out) forwards;
    transform-origin: 0 0;
  }

  .entry-review[data-closing] {
    animation: neon-entry-out 200ms var(--ease-out) forwards;
  }

  /* Growing out of its opener (morphIn) instead of sliding up. */
  .entry-review[data-morph] {
    animation: none;
  }

  /* The veil fades in and out (durations in DESIGN.md). */
  .neon-entry::backdrop {
    animation: neon-fade-in 240ms ease-out;
  }

  .neon-entry[data-leaving]::backdrop {
    animation: neon-entry-veil-out 200ms ease-out forwards;
  }
}

@media (prefers-reduced-motion: no-preference) and (width >= 61.3125rem) {
  .neon-entry::backdrop {
    animation-duration: 260ms;
  }
}

/* As a side panel it goes back out through its edge, whole (`anim-panel`). */
@media (prefers-reduced-motion: no-preference) and (width >= 61.3125rem) {
  .entry-review[data-closing] {
    animation: neon-panel-out 200ms cubic-bezier(0.4, 0, 1, 1) forwards;
  }
}

@keyframes neon-panel-out {
  to {
    transform: translateX(100%);
  }
}

@keyframes neon-entry-veil-out {
  to {
    opacity: 0;
  }
}

/* No opener: the mini modal, centred, fades and pops in and out (`--entry-from-*` is 0.97 then). */
@keyframes neon-mini-in {
  from {
    opacity: 0;
    transform: translate(var(--entry-from-x), var(--entry-from-y))
      scale(var(--entry-from-width), var(--entry-from-height));
  }
}

@keyframes neon-mini-out {
  to {
    opacity: 0;
    transform: translate(var(--entry-from-x), var(--entry-from-y))
      scale(var(--entry-from-width), var(--entry-from-height));
  }
}

@keyframes neon-entry-out {
  to {
    opacity: 0;
    transform: translateY(48px);
  }
}
</style>
