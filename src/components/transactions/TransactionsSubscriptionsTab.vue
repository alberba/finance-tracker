<script setup lang="ts">
import { computed, reactive, shallowRef } from 'vue'

import { useMoneyFormatter } from '../../composables/useMoneyFormatter'
import { type Subscription, type SubscriptionFrequency } from '../../scripts/types'
import { parseFloatSafe, todayISO } from '../../scripts/utils'
import { useMovementsStore } from '../../stores/movements'

defineProps<{ isActive: boolean }>()

const movementsStore = useMovementsStore()
const { formatMoney } = useMoneyFormatter()
const editingId = shallowRef<string | null>(null)
const form = reactive({
  name: '', amount: '', accountId: '', category: '',
  frequency: 'monthly' as SubscriptionFrequency, firstChargeDate: todayISO(),
})

const categoryOptions = computed(() => movementsStore.orderedCategories('expense'))
const isEditing = computed(() => editingId.value !== null)

function resetForm(): void {
  editingId.value = null
  form.name = ''
  form.amount = ''
  form.accountId = movementsStore.accounts[0]?.id ?? ''
  form.category = categoryOptions.value[0] ?? ''
  form.frequency = 'monthly'
  form.firstChargeDate = todayISO()
}

function editSubscription(subscription: Subscription): void {
  editingId.value = subscription.id
  form.name = subscription.name
  form.amount = String(subscription.amount)
  form.accountId = subscription.accountId
  form.category = subscription.category
  form.frequency = subscription.frequency
}

function submit(): void {
  const amount = parseFloatSafe(form.amount, 0)
  const saved = editingId.value
    ? movementsStore.updateSubscription(editingId.value, {
        name: form.name, amount, accountId: form.accountId,
        category: form.category, frequency: form.frequency,
      })
    : movementsStore.addSubscription({
        name: form.name, amount, accountId: form.accountId, category: form.category,
        frequency: form.frequency, firstChargeDate: form.firstChargeDate,
      })
  if (saved) resetForm()
}

function subscriptionStatus(subscription: Subscription): string {
  return subscription.active ? 'Activa' : 'Pausada'
}

function frequencyLabel(frequency: SubscriptionFrequency): string {
  return { weekly: 'Semanal', monthly: 'Mensual', quarterly: 'Trimestral', yearly: 'Anual' }[frequency]
}

resetForm()
</script>

<template>
  <section id="transactions-tab-subscriptions" :hidden="!isActive" class="grid gap-5" role="tabpanel" aria-labelledby="transactions-tab-subscriptions-button">
    <div class="rounded-xl border border-(--border) bg-(--panel) p-5 shadow-[0_12px_28px_color-mix(in_srgb,var(--text-main)_6%,transparent)]">
      <div class="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <p class="text-primary font-mono text-xs tracking-widest uppercase">Automatización</p>
          <h3 class="font-display text-text-main mt-1 text-xl">Gastos que no se te escapan</h3>
          <p class="text-text-muted mt-1 text-sm">Los cobros pendientes se registran al volver a abrir la aplicación.</p>
        </div>
        <span class="rounded-full border border-(--border) px-3 py-1 text-xs font-semibold text-(--text-muted)">{{ movementsStore.subscriptions.length }} suscripciones</span>
      </div>

      <form class="grid gap-3 md:grid-cols-2 xl:grid-cols-3" @submit.prevent="submit">
        <label class="grid gap-1 text-sm font-medium text-(--text-main)">Nombre<input v-model="form.name" name="subscriptionName" maxlength="80" required placeholder="Netflix" /></label>
        <label class="grid gap-1 text-sm font-medium text-(--text-main)">Importe<input v-model="form.amount" name="subscriptionAmount" type="number" min="0.01" step="0.01" required placeholder="0,00" /></label>
        <label class="grid gap-1 text-sm font-medium text-(--text-main)">Cuenta<select v-model="form.accountId" name="subscriptionAccount" required><option v-for="account in movementsStore.accounts" :key="account.id" :value="account.id">{{ account.name }}</option></select></label>
        <label class="grid gap-1 text-sm font-medium text-(--text-main)">Categoría<select v-model="form.category" name="subscriptionCategory" required><option v-for="category in categoryOptions" :key="category" :value="category">{{ category }}</option></select></label>
        <label class="grid gap-1 text-sm font-medium text-(--text-main)">Frecuencia<select v-model="form.frequency" name="subscriptionFrequency" required><option value="weekly">Semanal</option><option value="monthly">Mensual</option><option value="quarterly">Trimestral</option><option value="yearly">Anual</option></select></label>
        <label v-if="!isEditing" class="grid gap-1 text-sm font-medium text-(--text-main)">Primer cobro<input v-model="form.firstChargeDate" name="subscriptionFirstChargeDate" type="date" required /></label>
        <div class="flex items-end gap-2"><button type="submit" class="rounded-md bg-(--primary) px-4 py-2 text-sm font-semibold text-white transition hover:brightness-110">{{ isEditing ? 'Guardar cambios' : 'Añadir suscripción' }}</button><button v-if="isEditing" type="button" class="rounded-md border border-(--border) px-4 py-2 text-sm font-semibold text-(--text-main)" @click="resetForm">Cancelar</button></div>
      </form>
    </div>

    <div class="overflow-hidden rounded-xl border border-(--border) bg-(--panel)">
      <div v-if="!movementsStore.subscriptions.length" class="p-8 text-center text-sm text-(--text-muted)">Aún no hay suscripciones. Añade la primera para automatizar sus gastos.</div>
      <ul v-else class="divide-y divide-(--border)">
        <li v-for="subscription in movementsStore.subscriptions" :key="subscription.id" class="flex flex-wrap items-center justify-between gap-4 p-4">
          <div class="min-w-0"><div class="flex flex-wrap items-center gap-2"><strong class="text-(--text-main)">{{ subscription.name }}</strong><span class="rounded-full px-2 py-0.5 text-xs font-semibold" :class="subscription.active ? 'bg-[color-mix(in_srgb,var(--income)_16%,transparent)] text-(--income)' : 'bg-[color-mix(in_srgb,var(--text-muted)_15%,transparent)] text-(--text-muted)'">{{ subscriptionStatus(subscription) }}</span></div><p class="mt-1 text-sm text-(--text-muted)">{{ subscription.category }} · {{ frequencyLabel(subscription.frequency) }} · Próximo cobro: {{ subscription.nextChargeDate }}</p></div>
          <div class="flex flex-wrap items-center gap-2"><strong class="text-(--text-main)">{{ formatMoney(subscription.amount) }}</strong><button type="button" class="rounded-md border border-(--border) px-3 py-1.5 text-sm font-medium text-(--text-main)" @click="editSubscription(subscription)">Editar</button><button type="button" class="rounded-md border border-(--border) px-3 py-1.5 text-sm font-medium text-(--text-main)" @click="movementsStore.setSubscriptionActive(subscription.id, !subscription.active)">{{ subscription.active ? 'Pausar' : 'Reactivar' }}</button><button type="button" class="rounded-md px-3 py-1.5 text-sm font-medium text-(--expense)" @click="movementsStore.deleteSubscription(subscription.id)">Eliminar</button></div>
        </li>
      </ul>
    </div>
  </section>
</template>
