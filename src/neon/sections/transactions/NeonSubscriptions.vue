<script setup lang="ts">
import { computed, reactive, ref, shallowRef } from 'vue'

import { parseDecimal } from '../../../lib/number'
import type { Subscription, SubscriptionFrequency } from '../../../scripts/types'
import { todayISO } from '../../../scripts/utils'
import { useFinancialStateStore } from '../../../stores/financial-state'
import { useMovementsStore } from '../../../stores/movements'
import NeonButton from '../../ui/NeonButton.vue'
import NeonDetailPanel from '../../ui/NeonDetailPanel.vue'
import NeonEmptyState from '../../ui/NeonEmptyState.vue'
import {
  FREQUENCY_OPTIONS,
  subscriptionFields,
  subscriptionRows,
  subscriptionsSummary,
} from './subscriptions-view-model'

// «Suscripciones» of the new Movimientos: the list of subscriptions and, in
// the aside, what they commit each month and the next 30 days of charges.
// A row opens its detail in the shared panel, where it is paused, resumed,
// edited or deleted; «Nueva suscripción» opens the same panel as a form. All
// changes go through the movements store, with its validations and toasts.
const movementsStore = useMovementsStore()
const financialStateStore = useFinancialStateStore()
const currency = computed(() => financialStateStore.currency || 'EUR')

const rows = computed(() =>
  subscriptionRows(movementsStore.subscriptions, movementsStore.getAccountName, currency.value),
)
const summary = computed(() =>
  subscriptionsSummary(movementsStore.subscriptions, todayISO(), currency.value),
)

type Mode = 'view' | 'edit' | 'new' | 'confirm-delete'
const panelOpen = ref(false)
const mode = ref<Mode>('view')
const selected = shallowRef<Subscription | null>(null)
const form = reactive({
  name: '',
  amount: '',
  accountId: '',
  category: '',
  frequency: 'monthly' as SubscriptionFrequency,
  firstChargeDate: '',
})

const fields = computed(() =>
  selected.value
    ? subscriptionFields(selected.value, movementsStore.getAccountName, currency.value)
    : [],
)
const panelTitle = computed(() => {
  if (mode.value === 'new') return 'Nueva suscripción'
  if (mode.value === 'edit') return 'Editar suscripción'
  return selected.value?.name ?? ''
})
const categoryOptions = computed(() => {
  const names = movementsStore.orderedCategories('expense')
  return form.category && !names.includes(form.category) ? [form.category, ...names] : names
})

function openDetail(id: string): void {
  const subscription = movementsStore.subscriptions.find((item) => item.id === id)
  if (!subscription) return
  selected.value = { ...subscription }
  mode.value = 'view'
  panelOpen.value = true
}

function openNew(): void {
  selected.value = null
  form.name = ''
  form.amount = ''
  form.accountId = movementsStore.accounts[0]?.id ?? ''
  form.category = movementsStore.orderedCategories('expense')[0] ?? ''
  form.frequency = 'monthly'
  form.firstChargeDate = todayISO()
  mode.value = 'new'
  panelOpen.value = true
}

function startEdit(): void {
  const subscription = selected.value
  if (!subscription) return
  form.name = subscription.name
  form.amount = String(subscription.amount).replace('.', ',')
  form.accountId = subscription.accountId
  form.category = subscription.category
  form.frequency = subscription.frequency
  mode.value = 'edit'
}

function amount(): number {
  const value = parseDecimal(form.amount)
  return Number.isFinite(value) ? value : 0
}

function save(): void {
  if (mode.value === 'new') {
    const added = movementsStore.addSubscription({
      name: form.name,
      amount: amount(),
      accountId: form.accountId,
      category: form.category,
      frequency: form.frequency,
      firstChargeDate: form.firstChargeDate,
    })
    if (added) panelOpen.value = false
    return
  }
  const subscription = selected.value
  if (!subscription) return
  const updated = movementsStore.updateSubscription(subscription.id, {
    name: form.name,
    amount: amount(),
    accountId: form.accountId,
    category: form.category,
    frequency: form.frequency,
  })
  if (!updated) return
  refreshSelected(subscription.id)
  mode.value = 'view'
}

function refreshSelected(id: string): void {
  const fresh = movementsStore.subscriptions.find((item) => item.id === id)
  if (fresh) selected.value = { ...fresh }
}

function toggleActive(): void {
  const subscription = selected.value
  if (!subscription) return
  movementsStore.setSubscriptionActive(subscription.id, !subscription.active)
  refreshSelected(subscription.id)
}

function confirmDelete(): void {
  const subscription = selected.value
  if (!subscription) return
  movementsStore.deleteSubscription(subscription.id)
  panelOpen.value = false
}

defineExpose({ openNew })

const fieldClass =
  'bg-panel border-ctrl-line text-text outline-accent rounded-field min-h-[46px] w-full min-w-0 border px-3.5 text-[16px] font-bold focus-visible:outline-2 focus-visible:outline-offset-2'
const labelClass = 'text-muted grid min-w-0 gap-1.5 text-[13px] font-bold'
</script>

<template>
  <div class="subscriptions @container/subscriptions grid min-w-0">
    <div class="subscriptions-body grid min-w-0 items-start gap-5">
      <section
        v-if="rows.length"
        aria-label="Tus suscripciones"
        class="bg-panel border-line rounded-card min-w-0 overflow-hidden border"
        data-subscription-list
      >
        <button
          v-for="row in rows"
          :key="row.id"
          type="button"
          class="border-line text-text outline-accent hover:bg-panel2/60 flex min-h-16 w-full min-w-0 items-center justify-between gap-3 border-t px-6 py-2.5 text-start first:border-t-0 focus-visible:outline-2 focus-visible:-outline-offset-2"
          aria-haspopup="dialog"
          :data-subscription-id="row.id"
          @click="openDetail(row.id)"
        >
          <span class="grid min-w-0 gap-0.5">
            <span class="truncate text-[16px] font-bold" :class="row.active ? '' : 'text-soft'">
              {{ row.name }}
            </span>
            <span class="text-muted truncate text-[13px]">{{ row.meta }}</span>
          </span>
          <span class="grid shrink-0 justify-items-end gap-0.5">
            <span
              class="font-display text-[16px] font-semibold tabular-nums"
              :class="row.active ? '' : 'text-muted'"
            >
              {{ row.amount }}
            </span>
            <span
              class="text-[13px] font-bold whitespace-nowrap"
              :class="row.active ? 'text-soft' : 'text-muted'"
            >
              {{ row.status }}
            </span>
          </span>
        </button>
      </section>
      <NeonEmptyState v-else role="status">
        Aún no tienes suscripciones. Apunta las que pagas cada mes para ver lo que comprometen.
      </NeonEmptyState>

      <aside
        aria-label="Resumen de suscripciones"
        class="subscriptions-aside bg-panel border-line rounded-card grid gap-5 self-start border px-6 py-[22px]"
      >
        <div class="grid gap-2">
          <p class="text-muted text-[14px] font-bold">Comprometido al mes</p>
          <p
            class="font-display text-[clamp(34px,3.4cqi,44px)] leading-none font-semibold tracking-[-0.04em] whitespace-nowrap tabular-nums"
          >
            {{ summary.monthly }}
          </p>
          <p class="text-soft text-[15px]">{{ summary.line }}</p>
        </div>
        <div class="border-line grid gap-1 border-t pbs-[18px]">
          <h3 class="mbe-1.5 text-[18px] font-extrabold">
            Próximos 30 días
            <span class="text-muted font-bold">· {{ summary.next30 }}</span>
          </h3>
          <div
            v-for="charge in summary.upcoming"
            :key="charge.id"
            class="border-line flex min-w-0 items-center gap-3.5 border-t py-2.5"
          >
            <span
              class="font-display min-w-14 shrink-0 text-[14px] font-semibold whitespace-nowrap tabular-nums"
            >
              {{ charge.date }}
            </span>
            <span class="grid min-w-0 flex-1 gap-0.5">
              <span class="truncate text-[15px] font-bold">{{ charge.name }}</span>
              <span class="text-muted text-[13px]">{{ charge.when }}</span>
            </span>
            <span class="font-display shrink-0 text-[15px] font-semibold tabular-nums">
              {{ charge.amount }}
            </span>
          </div>
        </div>
      </aside>
    </div>

    <NeonDetailPanel
      v-model:open="panelOpen"
      :title="panelTitle"
      :kicker="mode === 'view' || mode === 'confirm-delete' ? 'Suscripción' : undefined"
    >
      <form
        v-if="mode === 'new' || mode === 'edit'"
        id="neon-subscription-form"
        class="grid gap-4"
        novalidate
        @submit.prevent="save"
      >
        <label :class="labelClass">
          Nombre
          <input v-model="form.name" name="name" maxlength="80" :class="fieldClass" />
        </label>
        <div class="grid grid-cols-[repeat(2,minmax(0,1fr))] gap-3">
          <label :class="labelClass">
            Importe
            <input
              v-model="form.amount"
              name="amount"
              inputmode="decimal"
              placeholder="0,00"
              :class="[fieldClass, 'font-display tabular-nums']"
            />
          </label>
          <label :class="labelClass">
            Frecuencia
            <select v-model="form.frequency" name="frequency" :class="fieldClass">
              <option v-for="option in FREQUENCY_OPTIONS" :key="option.value" :value="option.value">
                {{ option.label }}
              </option>
            </select>
          </label>
          <label :class="labelClass">
            Cuenta
            <select v-model="form.accountId" name="accountId" :class="fieldClass">
              <option
                v-for="account in movementsStore.accounts"
                :key="account.id"
                :value="account.id"
              >
                {{ account.name }}
              </option>
            </select>
          </label>
          <label :class="labelClass">
            Categoría
            <select v-model="form.category" name="category" :class="fieldClass">
              <option v-for="name in categoryOptions" :key="name" :value="name">{{ name }}</option>
            </select>
          </label>
          <label v-if="mode === 'new'" :class="[labelClass, 'col-span-full']">
            Primer cobro
            <input
              v-model="form.firstChargeDate"
              name="firstChargeDate"
              type="date"
              :class="fieldClass"
            />
          </label>
        </div>
      </form>

      <template v-else-if="selected">
        <dl class="grid text-[14px]">
          <div
            v-for="field in fields"
            :key="field.label"
            class="border-line flex justify-between gap-3 border-t py-[9px]"
          >
            <dt class="text-muted">{{ field.label }}</dt>
            <dd class="text-end font-bold">{{ field.value }}</dd>
          </div>
        </dl>
        <p class="text-soft text-[14px]">
          {{
            selected.active
              ? 'Activa: genera un gasto en cada cobro.'
              : 'En pausa: no genera gastos.'
          }}
        </p>
        <p v-if="mode === 'confirm-delete'" class="text-[14px] font-bold" role="alert">
          ¿Eliminar {{ selected.name }}? Los gastos que ya generó se conservan.
        </p>
      </template>

      <template #footer>
        <template v-if="mode === 'new' || mode === 'edit'">
          <NeonButton @click="mode === 'new' ? (panelOpen = false) : (mode = 'view')">
            Descartar
          </NeonButton>
          <NeonButton variant="primary" type="submit" form="neon-subscription-form">
            Guardar
          </NeonButton>
        </template>
        <template v-else-if="mode === 'confirm-delete'">
          <NeonButton @click="mode = 'view'">Cancelar</NeonButton>
          <NeonButton danger @click="confirmDelete">Eliminar suscripción</NeonButton>
        </template>
        <template v-else-if="selected">
          <NeonButton danger class="me-auto" @click="mode = 'confirm-delete'">Eliminar</NeonButton>
          <NeonButton @click="startEdit">Editar</NeonButton>
          <NeonButton @click="toggleActive">{{
            selected.active ? 'Pausar' : 'Reactivar'
          }}</NeonButton>
        </template>
      </template>
    </NeonDetailPanel>
  </div>
</template>

<style scoped>
@container subscriptions (min-width: 1040px) {
  .subscriptions-body {
    grid-template-columns: minmax(0, 1fr) 400px;
  }

  .subscriptions-aside {
    position: sticky;
    inset-block-start: 24px;
  }
}
</style>
