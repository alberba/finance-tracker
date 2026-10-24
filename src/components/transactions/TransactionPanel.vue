<script setup lang="ts">
import SetupRequirement from '../onboarding/SetupRequirement.vue'
import { useAccountRequirement } from '../../composables/useAccountRequirement'
import { computed, nextTick, reactive, ref, watch } from 'vue'

import BaseButton from '../ui/BaseButton.vue'
import BaseInput from '../ui/BaseInput.vue'
import BaseSelect from '../ui/BaseSelect.vue'
import SegmentedControl from '../ui/SegmentedControl.vue'
import SidePanel from '../ui/SidePanel.vue'
import { TYPE_LABEL, TYPE_OPTIONS, categorySelectOptions } from './transaction-types'
import { useMoneyFormatter } from '../../composables/useMoneyFormatter'
import { useToast } from '../../composables/useToast'
import { formatDayMonth, formatMonthName } from '../../lib/format'
import { ALL_MONTHS, monthFromDate } from '../../lib/month'
import { useSectionNavigation } from '../../composables/useSectionNavigation'
import { signedAmount } from '../../domain/transactions/registry'
import { formatDecimalInput, parseDecimal } from '../../lib/number'
import type { Transaction, TransactionType } from '../../scripts/types'
import { monthFromISO, todayISO } from '../../scripts/utils'
import { useMovementsStore } from '../../stores/movements'
import { useUiStore } from '../../stores/ui'

// Creates and edits a movement in the side panel. The same form serves both;
// only the title and the actions change.
const movementsStore = useMovementsStore()
const uiStore = useUiStore()
const { showToast } = useToast()
const { formatMoney, formatSignedMoney } = useMoneyFormatter()
const { navigateTo } = useSectionNavigation()

const open = ref(false)
const editingId = ref<string | null>(null)
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

const isEditing = computed(() => editingId.value !== null)
const monthOptions = ALL_MONTHS.map((month) => ({
  value: month,
  label: formatMonthName(month),
}))
const accountOptions = computed(() =>
  movementsStore.accounts.map((account) => ({ value: account.id, label: account.name })),
)
const isSaving = computed(() => form.type === 'saving')
// A saving never lands in the account it leaves.
const destinationOptions = computed(() =>
  accountOptions.value.filter((option) => option.value !== form.accountId),
)
const categoryOptions = computed(() => {
  const names = movementsStore.orderedCategories(form.type)
  return categorySelectOptions(names.length ? names : ['Sin categoría'], form.category)
})

const amount = computed(() => parseDecimal(form.amount))
const preview = computed(() => {
  const value = Number.isFinite(amount.value) ? Math.abs(amount.value) : 0
  // A saving moves money between accounts, so it carries no sign.
  if (isSaving.value) return formatMoney(value)
  return formatSignedMoney(signedAmount({ type: form.type, amount: value }))
})
const previewLabel = computed(
  () => `${TYPE_LABEL[form.type]} de ${formatMonthName(form.month).toLowerCase()}`,
)
const previewDetail = computed(() =>
  [
    movementsStore.getAccountName(form.accountId),
    isSaving.value ? movementsStore.getAccountName(form.destinationAccountId) : '',
    formatDayMonth(form.date),
  ]
    .filter(Boolean)
    .join(' · '),
)

let loadingMovement = false

watch(
  () => form.type,
  () => {
    // Against the new type's own list: `categoryOptions` keeps the chosen category even when
    // it belongs to another type, so it would never ask for a replacement.
    const names = movementsStore.orderedCategories(form.type)
    // Opening a movement fills its own category, even one that no longer exists.
    if (!loadingMovement && !names.includes(form.category)) {
      form.category = names[0] ?? 'Sin categoría'
    }
    ensureDestination()
  },
)
watch(() => form.accountId, ensureDestination)

// Keeps the destination valid: set, and different from the origin.
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

function reset(): void {
  form.amount = ''
  form.description = ''
  if (!movementsStore.accounts.some((account) => account.id === form.accountId)) {
    form.accountId = movementsStore.accounts[0]?.id ?? ''
  }
  if (!categoryOptions.value.some((option) => option.value === form.category)) {
    form.category = categoryOptions.value[0]?.value ?? ''
  }
  ensureDestination()
}

function openNew(): void {
  if (needsAccount.value) return
  editingId.value = null
  form.date = form.date || todayISO()
  onDateChange()
  reset()
  open.value = true
}

function openEdit(tx: Transaction): void {
  if (tx.remoteOperation) return
  editingId.value = tx.id
  loadingMovement = true
  void nextTick(() => {
    loadingMovement = false
  })
  form.type = tx.type
  form.amount = formatDecimalInput(Number(tx.amount || 0))
  form.description = tx.description || ''
  form.category = tx.category || ''
  form.accountId = tx.accountId
  form.destinationAccountId = tx.destinationAccountId ?? ''
  form.date = tx.date
  form.month = tx.month
  open.value = true
}

function save(keepOpen: boolean): void {
  if (needsAccount.value) return
  if (editingId.value) {
    const saved = movementsStore.saveEdit(editingId.value, {
      date: form.date,
      month: form.month,
      accountId: form.accountId,
      destinationAccountId: form.destinationAccountId,
      type: form.type,
      category: form.category,
      description: form.description,
      amount: Number.isFinite(amount.value) ? String(amount.value) : '',
    })
    if (saved) open.value = false
    return
  }
  const added = movementsStore.addTransaction({
    date: form.date || todayISO(),
    month: form.month,
    type: form.type,
    accountId: form.accountId,
    destinationAccountId: form.destinationAccountId,
    category: form.category,
    description: form.description,
    amount: Number.isFinite(amount.value) ? amount.value : 0,
  })
  if (!added) return
  reset()
  if (!keepOpen) open.value = false
  showToast(keepOpen ? 'Guardado. Puedes añadir otro.' : 'Movimiento guardado.')
}

function openInvestmentMovements(): void {
  open.value = false
  uiStore.ui.investmentTab = 'movements'
  navigateTo('investment')
}

defineExpose({ openNew, openEdit })
const { needsAccount } = useAccountRequirement()
</script>

<template>
  <SidePanel
    id="tx-panel"
    v-model:open="open"
    kicker="Movimiento"
    :title="isEditing ? 'Editar movimiento' : 'Nuevo movimiento'"
    title-id="tx-panel-title"
  >
    <SetupRequirement
      v-if="needsAccount"
      message="Crea una cuenta para guardar este formulario."
      @resolve="open = false"
    />
    <form id="tx-form" class="grid gap-6" autocomplete="off" @submit.prevent="save(false)">
      <SegmentedControl
        v-model="form.type"
        :options="TYPE_OPTIONS"
        label="Tipo de movimiento"
        variant="soft"
        data-key="tx-type"
        class="[&>button]:h-11 [&>button]:flex-1"
      />

      <BaseInput
        v-model="form.amount"
        label="Importe"
        variant="amount"
        suffix="€"
        name="amount"
        inputmode="decimal"
        placeholder="0,00"
        required
      />

      <fieldset class="grid gap-3.5 sm:grid-cols-2">
        <legend class="text-text-muted mb-3 text-xs font-bold tracking-widest uppercase">
          Detalle
        </legend>
        <BaseInput
          v-model="form.description"
          class="sm:col-span-2"
          label="Descripción"
          name="description"
          maxlength="140"
          placeholder="Opcional"
        />
        <BaseSelect
          v-model="form.category"
          label="Categoría"
          name="category"
          :options="categoryOptions"
        />
        <BaseSelect
          v-model="form.accountId"
          :label="isSaving ? 'Cuenta origen' : 'Cuenta'"
          name="accountId"
          :options="accountOptions"
        />
        <BaseSelect
          v-if="isSaving"
          v-model="form.destinationAccountId"
          label="Cuenta destino"
          name="destinationAccountId"
          :options="destinationOptions"
        />
      </fieldset>

      <fieldset class="grid gap-3.5 sm:grid-cols-2">
        <legend class="text-text-muted mb-3 text-xs font-bold tracking-widest uppercase">
          Cuándo
        </legend>
        <BaseInput
          v-model="form.date"
          label="Fecha"
          name="date"
          type="date"
          required
          @change="onDateChange"
        />
        <BaseSelect
          v-model="form.month"
          label="Cuenta en el mes"
          name="month"
          :options="monthOptions"
        />
        <p class="text-text-muted text-sm sm:col-span-2">
          Sale de la fecha. Cámbialo si el cargo corresponde a otro mes, como una nómina que llega
          el día 28.
        </p>
      </fieldset>

      <div
        class="bg-ink border-ink-line text-ink-text flex items-center justify-between gap-4 rounded-md border px-5 py-4"
      >
        <div class="grid gap-1">
          <span class="text-ink-muted text-sm">{{ previewLabel }}</span>
          <span class="text-ink-text/80 text-sm">{{ previewDetail }}</span>
        </div>
        <p class="font-display text-2xl font-medium tabular-nums" data-tx-preview>
          {{ preview }}
        </p>
      </div>

      <p v-if="form.type === 'investment'" class="text-text-muted text-sm">
        ¿Compras o vendes títulos? Regístralo en
        <a
          href="/inversion"
          class="text-primary font-semibold underline-offset-2 hover:underline"
          @click.prevent="openInvestmentMovements"
          >Inversión › Movimientos</a
        >
        para guardar símbolo, títulos y precio.
      </p>
    </form>

    <template #footer>
      <BaseButton variant="ghost" @click="open = false">Cancelar</BaseButton>
      <BaseButton
        v-if="!isEditing"
        id="tx-submit-more"
        :disabled="needsAccount"
        @click="save(true)"
      >
        Guardar y añadir otro
      </BaseButton>
      <BaseButton variant="primary" :disabled="needsAccount" type="submit" form="tx-form">
        {{ isEditing ? 'Guardar cambios' : 'Guardar movimiento' }}
      </BaseButton>
    </template>
  </SidePanel>
</template>
