<script setup lang="ts">
import { computed, reactive, shallowRef } from 'vue'

import SubscriptionsAnalysis from './SubscriptionsAnalysis.vue'
import SubscriptionsList from './SubscriptionsList.vue'
import { type Subscription, type SubscriptionFrequency } from '../../scripts/types'
import { parseFloatSafe, todayISO } from '../../scripts/utils'
import { useMovementsStore } from '../../stores/movements'

defineProps<{ isActive: boolean }>()

const movementsStore = useMovementsStore()
const editingId = shallowRef<string | null>(null)
const form = reactive({
  name: '',
  amount: '',
  accountId: '',
  category: '',
  frequency: 'monthly' as SubscriptionFrequency,
  firstChargeDate: todayISO(),
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
        name: form.name,
        amount,
        accountId: form.accountId,
        category: form.category,
        frequency: form.frequency,
      })
    : movementsStore.addSubscription({
        name: form.name,
        amount,
        accountId: form.accountId,
        category: form.category,
        frequency: form.frequency,
        firstChargeDate: form.firstChargeDate,
      })

  if (saved) resetForm()
}

resetForm()
</script>

<template>
  <section
    id="transactions-tab-subscriptions"
    :hidden="!isActive"
    class="grid gap-4"
    role="tabpanel"
    aria-labelledby="transactions-tab-subscriptions-button"
  >
    <article class="subscription-editor" aria-labelledby="subscription-editor-title">
      <header class="subscription-editor__header">
        <div>
          <p class="subscription-editor__kicker">Automatización</p>
          <h3 id="subscription-editor-title" class="subscription-editor__title">
            {{ isEditing ? 'Edita el próximo cargo' : 'Programa un gasto recurrente' }}
          </h3>
          <p class="subscription-editor__description">
            Los cobros pendientes se registran al volver a abrir la aplicación.
          </p>
        </div>
      </header>

      <form class="subscription-editor__form" autocomplete="off" @submit.prevent="submit">
        <label class="subscription-field subscription-field--wide">
          Nombre
          <input
            v-model="form.name"
            name="subscriptionName"
            maxlength="80"
            required
            placeholder="Netflix"
          />
        </label>
        <label class="subscription-field subscription-field--amount">
          Importe
          <span class="subscription-amount-input">
            <span aria-hidden="true">€</span>
            <input
              v-model="form.amount"
              name="subscriptionAmount"
              type="number"
              min="0.01"
              step="0.01"
              required
              placeholder="0,00"
            />
          </span>
        </label>
        <label class="subscription-field">
          Cuenta
          <select v-model="form.accountId" name="subscriptionAccount" required>
            <option
              v-for="account in movementsStore.accounts"
              :key="account.id"
              :value="account.id"
            >
              {{ account.name }}
            </option>
          </select>
        </label>
        <label class="subscription-field">
          Categoría
          <select v-model="form.category" name="subscriptionCategory" required>
            <option v-for="category in categoryOptions" :key="category" :value="category">
              {{ category }}
            </option>
          </select>
        </label>
        <label class="subscription-field">
          Frecuencia
          <select v-model="form.frequency" name="subscriptionFrequency" required>
            <option value="weekly">Semanal</option>
            <option value="monthly">Mensual</option>
            <option value="quarterly">Trimestral</option>
            <option value="yearly">Anual</option>
          </select>
        </label>
        <label v-if="!isEditing" class="subscription-field">
          Primer cobro
          <input
            v-model="form.firstChargeDate"
            name="subscriptionFirstChargeDate"
            type="date"
            required
          />
        </label>
        <div class="subscription-editor__actions">
          <button type="submit" class="subscription-primary-button">
            {{ isEditing ? 'Guardar cambios' : 'Añadir suscripción' }}
          </button>
          <button
            v-if="isEditing"
            type="button"
            class="subscription-secondary-button"
            @click="resetForm"
          >
            Cancelar
          </button>
        </div>
      </form>
    </article>

    <SubscriptionsAnalysis :subscriptions="movementsStore.subscriptions" />

    <SubscriptionsList
      :subscriptions="movementsStore.subscriptions"
      @edit="editSubscription"
      @toggle-active="movementsStore.setSubscriptionActive($event.id, !$event.active)"
      @delete="movementsStore.deleteSubscription"
    />
  </section>
</template>

<style scoped>
.subscription-editor {
  overflow: hidden;
  border: 1px solid var(--line);
  border-radius: var(--radius-lg);
  background: var(--bg-panel);
  box-shadow: var(--shadow-soft);
}

.subscription-editor__header {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-start;
  justify-content: space-between;
  gap: 1rem;
  padding: clamp(1.1rem, 2vw, 1.5rem);
}

.subscription-editor__header {
  border-bottom: 1px solid var(--line);
  background: linear-gradient(
    135deg,
    color-mix(in srgb, var(--primary) 11%, var(--bg-panel)),
    var(--bg-panel) 55%
  );
}

.subscription-editor__kicker {
  margin: 0;
  color: var(--primary);
  font-family: 'DM Mono', monospace;
  font-size: 0.7rem;
  font-weight: 700;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}

.subscription-editor__title {
  margin: 0.35rem 0 0;
  color: var(--text-main);
  font-family: 'Syne', sans-serif;
  font-size: clamp(1.2rem, 2vw, 1.45rem);
  letter-spacing: -0.025em;
}

.subscription-editor__description {
  margin: 0.4rem 0 0;
  color: var(--text-muted);
  font-size: 0.86rem;
  line-height: 1.45;
}

.subscription-editor__form {
  display: grid;
  grid-template-columns: minmax(0, 1.5fr) minmax(130px, 0.75fr) repeat(3, minmax(140px, 1fr));
  gap: 1rem;
  padding: clamp(1.1rem, 2vw, 1.5rem);
  background: var(--bg-subtle);
}

.subscription-field {
  display: grid;
  gap: 0.38rem;
  min-width: 0;
  color: var(--text-muted);
  font-size: 0.68rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.subscription-field :is(input, select),
.subscription-amount-input {
  box-sizing: border-box;
  width: 100%;
  min-height: 44px;
  border: 1px solid var(--line);
  border-radius: var(--radius-md);
  background: var(--bg-card);
  color: var(--text-main);
  font: inherit;
  font-size: 0.9rem;
  font-weight: 500;
  letter-spacing: normal;
  text-transform: none;
}

.subscription-field :is(input, select) {
  padding: 0.6rem 0.75rem;
}

.subscription-field :is(input, select):focus-visible,
.subscription-primary-button:focus-visible,
.subscription-secondary-button:focus-visible {
  border-color: var(--primary);
  outline: none;
  box-shadow: 0 0 0 3px var(--ring);
}

.subscription-field input::placeholder {
  color: var(--text-faint);
}

.subscription-amount-input {
  display: flex;
  align-items: center;
  padding-left: 0.8rem;
  color: var(--text-muted);
  font-family: 'DM Mono', monospace;
  font-size: 1rem;
}

.subscription-amount-input input {
  min-width: 0;
  border: 0;
  padding-left: 0.4rem;
  font-family: inherit;
  font-size: 1rem;
  font-variant-numeric: tabular-nums;
}

.subscription-amount-input input:focus-visible {
  box-shadow: none;
}

.subscription-editor__actions {
  display: flex;
  flex-wrap: wrap;
  align-items: end;
  gap: 0.55rem;
}

.subscription-primary-button,
.subscription-secondary-button {
  min-height: 42px;
  border-radius: var(--radius-md);
  font: inherit;
  font-size: 0.84rem;
  font-weight: 700;
  cursor: pointer;
  transition:
    background 0.15s,
    border-color 0.15s,
    box-shadow 0.15s,
    transform 0.15s;
}

.subscription-primary-button {
  min-width: max-content;
  padding: 0.6rem 1rem;
  border: 1px solid var(--primary);
  background: linear-gradient(
    180deg,
    color-mix(in srgb, var(--primary) 92%, #fff 8%),
    var(--primary)
  );
  color: #fff;
  box-shadow: 0 2px 10px color-mix(in srgb, var(--primary) 36%, transparent);
}

.subscription-primary-button:hover {
  box-shadow: 0 6px 20px color-mix(in srgb, var(--primary) 46%, transparent);
  transform: translateY(-1px);
}

.subscription-secondary-button {
  padding: 0.55rem 0.75rem;
  border: 1px solid var(--line);
  background: var(--bg-panel);
  color: var(--text-main);
}

.subscription-secondary-button:hover {
  border-color: var(--line-strong);
  background: color-mix(in srgb, var(--primary) 7%, var(--bg-panel));
}

@media (max-width: 1080px) {
  .subscription-editor__form {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }

  .subscription-field--wide {
    grid-column: span 2;
  }
}

@media (max-width: 720px) {
  .subscription-editor__form {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .subscription-field--wide,
  .subscription-field--amount,
  .subscription-editor__actions {
    grid-column: span 2;
  }

  .subscription-editor__actions {
    align-items: center;
  }

  .subscription-primary-button,
  .subscription-secondary-button {
    flex: 1 1 0;
  }
}

@media (max-width: 460px) {
  .subscription-editor__header {
    padding: 1rem;
  }

  .subscription-editor__form {
    grid-template-columns: minmax(0, 1fr);
    padding: 1rem;
  }

  .subscription-field--wide,
  .subscription-field--amount,
  .subscription-editor__actions {
    grid-column: auto;
  }
}
</style>
