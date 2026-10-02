<script setup lang="ts">
import { computed, reactive, ref } from 'vue'

import BaseButton from '../ui/BaseButton.vue'
import BaseInput from '../ui/BaseInput.vue'
import BaseSelect from '../ui/BaseSelect.vue'
import SegmentedControl from '../ui/SegmentedControl.vue'
import SidePanel from '../ui/SidePanel.vue'
import { categorySelectOptions } from './transaction-types'
import { useMoneyFormatter } from '../../composables/useMoneyFormatter'
import { annualizeSubscription } from '../../domain/subscriptions/analysis'
import { formatDecimalInput, parseDecimal } from '../../lib/number'
import type { Subscription, SubscriptionFrequency } from '../../scripts/types'
import { todayISO } from '../../scripts/utils'
import { useMovementsStore } from '../../stores/movements'

// Creates and edits a subscription in the side panel; shows what it costs
// per month and per year while it is typed.
const DEFAULT_CATEGORY = 'Suscripciones'

const movementsStore = useMovementsStore()
const { formatMoney } = useMoneyFormatter()

const open = ref(false)
const editingId = ref<string | null>(null)
const form = reactive({
  name: '',
  amount: '',
  frequency: 'monthly' as SubscriptionFrequency,
  firstChargeDate: '',
  accountId: '',
  category: '',
})

const isEditing = computed(() => editingId.value !== null)
const frequencyOptions = [
  { value: 'weekly' as const, label: 'Semanal' },
  { value: 'monthly' as const, label: 'Mensual' },
  { value: 'quarterly' as const, label: 'Trimestral' },
  { value: 'yearly' as const, label: 'Anual' },
]
const accountOptions = computed(() =>
  movementsStore.accounts.map((account) => ({ value: account.id, label: account.name })),
)
const categoryOptions = computed(() =>
  categorySelectOptions(movementsStore.orderedCategories('expense'), form.category),
)

const amount = computed(() => parseDecimal(form.amount))
const annual = computed(() =>
  annualizeSubscription({
    amount: Number.isFinite(amount.value) ? amount.value : 0,
    frequency: form.frequency,
  } as Subscription),
)

function openNew(): void {
  editingId.value = null
  const categories = movementsStore.orderedCategories('expense')
  form.name = ''
  form.amount = ''
  form.frequency = 'monthly'
  form.firstChargeDate = todayISO()
  form.accountId = movementsStore.accounts[0]?.id ?? ''
  form.category = categories.includes(DEFAULT_CATEGORY) ? DEFAULT_CATEGORY : (categories[0] ?? '')
  open.value = true
}

function openEdit(subscription: Subscription): void {
  editingId.value = subscription.id
  form.name = subscription.name
  form.amount = formatDecimalInput(subscription.amount)
  form.frequency = subscription.frequency
  form.accountId = subscription.accountId
  form.category = subscription.category
  open.value = true
}

function save(): void {
  const fields = {
    name: form.name,
    amount: Number.isFinite(amount.value) ? amount.value : 0,
    accountId: form.accountId,
    category: form.category,
    frequency: form.frequency,
  }
  const saved = editingId.value
    ? movementsStore.updateSubscription(editingId.value, fields)
    : movementsStore.addSubscription({ ...fields, firstChargeDate: form.firstChargeDate })
  if (saved) open.value = false
}

defineExpose({ openNew, openEdit })
</script>

<template>
  <SidePanel
    id="subscription-panel"
    v-model:open="open"
    kicker="Gasto fijo"
    :title="isEditing ? 'Editar suscripción' : 'Nueva suscripción'"
    title-id="subscription-panel-title"
  >
    <form id="subscription-form" class="grid gap-6" autocomplete="off" @submit.prevent="save">
      <fieldset class="grid gap-3.5 sm:grid-cols-[minmax(0,1fr)_11rem]">
        <legend class="text-text-muted mb-3 text-xs font-bold tracking-widest uppercase">
          Qué pagas
        </legend>
        <BaseInput
          v-model="form.name"
          label="Nombre"
          name="subscriptionName"
          maxlength="80"
          placeholder="Netflix"
          required
        />
        <BaseInput
          v-model="form.amount"
          label="Importe"
          name="subscriptionAmount"
          inputmode="decimal"
          placeholder="0,00"
          suffix="€"
          required
        />
      </fieldset>

      <fieldset class="grid gap-3.5">
        <legend class="text-text-muted mb-3 text-xs font-bold tracking-widest uppercase">
          Cada cuánto
        </legend>
        <SegmentedControl
          v-model="form.frequency"
          :options="frequencyOptions"
          label="Frecuencia"
          variant="soft"
          data-key="frequency"
          class="[&>button]:h-11 [&>button]:flex-1"
        />
        <BaseInput
          v-if="!isEditing"
          v-model="form.firstChargeDate"
          label="Primer cobro"
          name="subscriptionFirstChargeDate"
          type="date"
          required
        />
      </fieldset>

      <fieldset class="grid gap-3.5 sm:grid-cols-2">
        <legend class="text-text-muted mb-3 text-xs font-bold tracking-widest uppercase">
          Dónde
        </legend>
        <BaseSelect
          v-model="form.accountId"
          label="Cuenta"
          name="subscriptionAccount"
          :options="accountOptions"
        />
        <BaseSelect
          v-model="form.category"
          label="Categoría"
          name="subscriptionCategory"
          :options="categoryOptions"
        />
      </fieldset>

      <div
        class="bg-ink border-ink-line text-ink-text flex items-center justify-between gap-4 rounded-md border px-5 py-4"
      >
        <div class="grid gap-1">
          <span class="text-ink-muted text-sm">Equivale a</span>
          <span class="font-display text-ink-text/80 text-sm tabular-nums">
            {{ formatMoney(annual) }} al año
          </span>
        </div>
        <p class="font-display text-2xl font-medium tabular-nums" data-subscription-preview>
          ≈ {{ formatMoney(annual / 12) }} / mes
        </p>
      </div>
      <p class="text-text-muted text-sm">
        Mientras esté activa, cada cobro se apunta como gasto en el Registro el día que vence. Si la
        pausas, deja de apuntarse.
      </p>
    </form>

    <template #footer>
      <BaseButton variant="ghost" @click="open = false">Cancelar</BaseButton>
      <BaseButton variant="primary" type="submit" form="subscription-form">
        {{ isEditing ? 'Guardar cambios' : 'Añadir suscripción' }}
      </BaseButton>
    </template>
  </SidePanel>
</template>
