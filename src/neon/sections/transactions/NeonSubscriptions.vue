<script setup lang="ts">
import { computed, reactive, ref, shallowRef } from 'vue'

import { useMediaQuery } from '../../../composables/useMediaQuery'
import { parseDecimal } from '../../../lib/number'
import type { Subscription, SubscriptionFrequency } from '../../../scripts/types'
import { todayISO } from '../../../scripts/utils'
import { useFinancialStateStore } from '../../../stores/financial-state'
import { useMovementsStore } from '../../../stores/movements'
import NeonButton from '../../ui/NeonButton.vue'
import NeonDetailPanel from '../../ui/NeonDetailPanel.vue'
import NeonEmptyState from '../../ui/NeonEmptyState.vue'
import NeonFigure from '../../ui/NeonFigure.vue'
import { FRAME_QUERY } from '../../ui/sheet-drag'
import {
  FREQUENCY_OPTIONS,
  subscriptionFields,
  subscriptionRows,
  subscriptionsSummary,
} from './subscriptions-view-model'

// «Suscripciones» of the new Movimientos: a table that compares them by what
// each costs per month (the active ones, with their total, then the paused
// ones with what they save) and, in the aside, what they commit each month,
// the charges of the next 12 months as bars and the next charge of each.
// A row opens its detail in the shared panel, where it is paused, resumed,
// edited or deleted; «Nueva suscripción» opens the same panel as a form. All
// changes go through the movements store, with its validations and toasts.
//
// On the mobile frame (artboard «Movimientos · móvil», #432) the two figures
// lead as a pair of tiles (monthly and yearly), the table folds each row into
// two lines (per month on the right, with non-monthly charges under it), and
// the next charges come before the chart in their own card.
const movementsStore = useMovementsStore()
const financialStateStore = useFinancialStateStore()
const currency = computed(() => financialStateStore.currency || 'EUR')
const desktopFrame = useMediaQuery(FRAME_QUERY)

const rows = computed(() =>
  subscriptionRows(
    movementsStore.subscriptions,
    movementsStore.getAccountName,
    todayISO(),
    currency.value,
  ),
)
const groups = computed(() =>
  [
    { key: 'active', rows: rows.value.filter((row) => row.active) },
    { key: 'paused', rows: rows.value.filter((row) => !row.active) },
  ].filter((group) => group.rows.length),
)
const summary = computed(() =>
  subscriptionsSummary(movementsStore.subscriptions, todayISO(), currency.value),
)
const peakAmount = computed(() => summary.value.months.find((month) => month.height === 1)?.amount)

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
      <div
        v-if="!desktopFrame"
        class="grid grid-cols-[repeat(2,minmax(0,1fr))] gap-3"
        aria-label="Lo que comprometen"
        role="group"
      >
        <div
          v-for="tile in [
            { label: 'Comprometido al mes', value: summary.monthly },
            { label: 'Proyección anual', value: summary.annual },
          ]"
          :key="tile.label"
          class="bg-panel border-line rounded-card grid min-w-0 gap-1.5 border px-3.5 py-4"
        >
          <p class="text-muted text-[13px] font-bold">{{ tile.label }}</p>
          <p
            class="font-display text-[22px] leading-[1.2] font-semibold tracking-[-0.02em] whitespace-nowrap tabular-nums"
          >
            {{ tile.value }}
          </p>
        </div>
      </div>
      <section
        v-if="rows.length"
        aria-label="Tus suscripciones"
        class="subscriptions-table bg-panel border-line rounded-card min-w-0 overflow-hidden border"
        data-subscription-list
      >
        <div
          class="sub-grid text-muted text-label border-line hidden min-h-[46px] items-center border-b px-6 font-extrabold tracking-[0.08em] uppercase @min-[720px]/subscriptions:grid"
          aria-hidden="true"
        >
          <span>Suscripción</span>
          <span class="text-end">Cada</span>
          <span class="text-end">Cobro</span>
          <span class="text-end">Al mes</span>
          <span class="text-end">Próximo</span>
        </div>
        <template v-for="(group, index) in groups" :key="group.key">
          <div
            v-if="group.key === 'paused'"
            class="border-line flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 px-3.5 pbs-5 pbe-2 @min-[560px]/subscriptions:px-6"
            :class="index > 0 && 'border-t'"
          >
            <h3 class="text-muted text-label font-extrabold tracking-[0.08em] uppercase">
              En pausa
            </h3>
            <p class="text-muted text-[14px] font-bold">{{ summary.paused }}</p>
          </div>
          <button
            v-for="row in group.rows"
            :key="row.id"
            type="button"
            class="sub-row border-line text-text outline-accent hover:bg-panel2/60 grid min-h-16 w-full min-w-0 items-center gap-x-3 gap-y-0.5 border-t px-3.5 py-2.5 text-start focus-visible:outline-2 focus-visible:-outline-offset-2 @min-[560px]/subscriptions:px-6"
            :class="[group.key === 'active' && 'first-of-type:border-t-0', !row.active && 'text-muted']"
            aria-haspopup="dialog"
            :data-subscription-id="row.id"
            @click="openDetail(row.id)"
          >
            <span class="sub-name grid min-w-0 gap-0.5">
              <span class="truncate text-[16px] font-bold" :class="row.active ? '' : 'text-soft'">
                {{ row.name }}
              </span>
              <span class="text-muted truncate text-[13px]">
                <span class="hidden @min-[720px]/subscriptions:inline">{{ row.meta }}</span>
                <span class="@min-[720px]/subscriptions:hidden">
                  {{ row.active ? `Próximo ${row.next}` : 'En pausa' }}
                </span>
              </span>
            </span>
            <span
              class="sub-freq text-soft hidden text-end text-[14px] font-bold @min-[720px]/subscriptions:block"
            >
              {{ row.frequency }}
            </span>
            <span
              class="sub-amount font-display hidden text-end text-[16px] font-semibold whitespace-nowrap tabular-nums @min-[720px]/subscriptions:block"
            >
              {{ row.amount }}
            </span>
            <span class="sub-monthly grid justify-items-end gap-0.5">
              <span class="font-display text-[16px] font-semibold whitespace-nowrap tabular-nums">
                {{ row.monthly }}
                <span class="text-muted font-sans text-[13px] font-bold @min-[720px]/subscriptions:hidden">
                  al mes
                </span>
              </span>
              <span
                v-if="row.periodicCharge"
                class="text-muted text-[13px] font-bold whitespace-nowrap @min-[720px]/subscriptions:hidden"
              >
                {{ row.periodicCharge }}
              </span>
            </span>
            <span
              class="sub-next hidden text-end text-[14px] font-bold whitespace-nowrap @min-[720px]/subscriptions:grid"
            >
              {{ row.next }}
              <span v-if="row.when" class="text-muted text-[13px] font-semibold">{{ row.when }}</span>
            </span>
          </button>
          <div
            v-if="group.key === 'active'"
            class="sub-total bg-panel2 border-line hidden min-h-12 items-center gap-x-3 border-t px-3.5 text-[15px] font-extrabold @min-[560px]/subscriptions:px-6 @min-[720px]/subscriptions:grid"
          >
            <span>{{ group.rows.length }} {{ group.rows.length === 1 ? 'activa' : 'activas' }}</span>
            <span class="sub-monthly font-display text-end font-semibold tabular-nums">
              {{ summary.monthly }}
              <span class="text-muted font-sans text-[13px] font-bold @min-[720px]/subscriptions:hidden">
                al mes
              </span>
            </span>
          </div>
        </template>
      </section>
      <NeonEmptyState v-else role="status">
        Aún no tienes suscripciones. Apunta las que pagas cada mes para ver lo que comprometen.
      </NeonEmptyState>

      <aside
        v-if="rows.some((row) => row.active)"
        aria-label="Resumen de suscripciones"
        class="subscriptions-aside bg-panel border-line rounded-card grid gap-5 self-start border px-3.5 py-4 @min-[560px]/subscriptions:px-6 @min-[560px]/subscriptions:py-[22px]"
      >
        <div v-if="desktopFrame" class="grid gap-2">
          <p class="text-muted text-[14px] font-bold">Comprometido al mes</p>
          <p class="text-figure-lg font-semibold" data-subscriptions-monthly>
            <NeonFigure :value="summary.monthly" />
          </p>
          <p class="text-soft text-[15px]">{{ summary.line }}</p>
        </div>
        <section
          aria-labelledby="subscriptions-upcoming-title"
          class="grid gap-1.5"
          :class="desktopFrame && 'border-line order-last border-t pbs-5'"
        >
          <h3 id="subscriptions-upcoming-title" class="text-[18px] font-extrabold">
            Próximos cobros
          </h3>
          <ul v-if="summary.upcoming.length" class="grid gap-1">
            <li
              v-for="charge in summary.upcoming"
              :key="charge.id"
              class="border-line flex min-w-0 items-center gap-3.5 py-2.5 [&+li]:border-t"
            >
              <span
                class="font-display min-w-16 shrink-0 text-[14px] font-semibold whitespace-nowrap tabular-nums"
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
            </li>
          </ul>
          <p v-else class="text-muted text-[14px]">No hay cobros previstos en los próximos 12 meses.</p>
        </section>

        <section
          aria-labelledby="subscriptions-months-title"
          class="border-line grid gap-2 border-t pbs-5"
        >
          <div class="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
            <h3 id="subscriptions-months-title" class="text-[18px] font-extrabold">
              Próximos 12 meses
            </h3>
            <p v-if="peakAmount" class="text-muted text-[13px] font-bold">
              Máximo
              <span class="font-display text-text whitespace-nowrap tabular-nums">{{
                peakAmount
              }}</span>
            </p>
          </div>
          <ol
            class="grid h-28 grid-cols-[repeat(12,minmax(0,1fr))] items-end gap-1.5"
            aria-label="Cobros de cada mes"
            data-subscription-months
          >
            <li
              v-for="month in summary.months"
              :key="month.key"
              class="flex h-full flex-col items-center justify-end gap-1.5"
              :aria-label="month.title"
            >
              <span
                class="w-full rounded-t-[6px] rounded-b-[2px]"
                :class="month.peak ? 'bg-text' : 'bg-neutral-bar'"
                :style="{ blockSize: month.height ? `max(4px, ${month.height * 76}%)` : '2px' }"
                aria-hidden="true"
              ></span>
              <span class="text-muted text-label font-extrabold uppercase" aria-hidden="true">
                <span class="@min-[560px]/subscriptions:hidden">{{ month.label[0] }}</span>
                <span class="hidden @min-[560px]/subscriptions:inline">{{ month.label }}</span>
              </span>
            </li>
          </ol>
          <p v-if="summary.partialMonth" class="text-muted text-[13px]">
            {{ summary.partialMonth }} desde hoy.
          </p>
        </section>
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
.sub-row,
.sub-total {
  grid-template-columns: minmax(0, 1fr) auto;
}

@container subscriptions (min-width: 720px) {
  .sub-grid,
  .sub-row {
    grid-template-columns: minmax(0, 1fr) 96px 112px 112px 120px;
    column-gap: 16px;
  }

  .sub-total {
    grid-template-columns: minmax(0, 1fr) 112px 120px;
    column-gap: 16px;
  }
}

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
