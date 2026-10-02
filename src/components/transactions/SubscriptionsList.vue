<script setup lang="ts">
import { computed } from 'vue'

import { useMoneyFormatter } from '../../composables/useMoneyFormatter'
import type { Subscription, SubscriptionFrequency } from '../../scripts/types'

const props = defineProps<{
  subscriptions: Subscription[]
}>()

const emit = defineEmits<{
  edit: [subscription: Subscription]
  toggleActive: [subscription: Subscription]
  delete: [id: string]
}>()

const { formatMoney } = useMoneyFormatter()
const activeSubscriptionCount = computed(
  () => props.subscriptions.filter((subscription) => subscription.active).length,
)

function frequencyLabel(frequency: SubscriptionFrequency): string {
  return {
    weekly: 'Semanal',
    monthly: 'Mensual',
    quarterly: 'Trimestral',
    yearly: 'Anual',
  }[frequency]
}
</script>

<template>
  <section class="subscription-list" aria-labelledby="subscription-list-title">
    <header class="subscription-list__header">
      <div>
        <p class="subscription-list__eyebrow">Gastos planificados</p>
        <h3 id="subscription-list-title" class="subscription-list__title">Tus suscripciones</h3>
      </div>
      <div class="subscription-list__metrics" aria-label="Resumen de suscripciones">
        <span class="subscription-list__metric">
          <strong>{{ activeSubscriptionCount }}</strong> activas
        </span>
        <span class="subscription-list__count">{{ props.subscriptions.length }} suscripciones</span>
      </div>
    </header>

    <p v-if="!props.subscriptions.length" class="subscription-list__empty">
      Aún no hay suscripciones. Añade la primera para automatizar tus gastos.
    </p>
    <ul v-else class="subscription-list__items">
      <li
        v-for="subscription in props.subscriptions"
        :key="subscription.id"
        class="subscription-card"
      >
        <div class="subscription-card__main">
          <div class="subscription-card__heading">
            <strong>{{ subscription.name }}</strong>
            <span
              class="subscription-status"
              :class="
                subscription.active ? 'subscription-status--active' : 'subscription-status--paused'
              "
            >
              {{ subscription.active ? 'Activa' : 'Pausada' }}
            </span>
          </div>
          <p class="subscription-card__meta">
            {{ subscription.category }} · {{ frequencyLabel(subscription.frequency) }}
          </p>
          <p class="subscription-card__next-charge">
            Próximo cobro:
            <time :datetime="subscription.nextChargeDate">{{ subscription.nextChargeDate }}</time>
          </p>
        </div>
        <div class="subscription-card__side">
          <strong class="subscription-card__amount">{{ formatMoney(subscription.amount) }}</strong>
          <div class="subscription-card__actions">
            <button
              type="button"
              class="subscription-icon-button"
              @click="emit('edit', subscription)"
            >
              Editar
            </button>
            <button
              type="button"
              class="subscription-icon-button"
              @click="emit('toggleActive', subscription)"
            >
              {{ subscription.active ? 'Pausar' : 'Reactivar' }}
            </button>
            <button
              type="button"
              class="subscription-delete-button"
              @click="emit('delete', subscription.id)"
            >
              Eliminar
            </button>
          </div>
        </div>
      </li>
    </ul>
  </section>
</template>

<style scoped>
.subscription-list {
  overflow: hidden;
  border: 1px solid var(--line);
  border-radius: var(--radius-lg);
  background: var(--bg-panel);
  box-shadow: var(--shadow-soft);
}

.subscription-list__header {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  padding: clamp(1.1rem, 2vw, 1.5rem);
  border-bottom: 1px solid var(--line);
}

.subscription-list__eyebrow {
  margin: 0;
  color: var(--primary);
  font-family: 'DM Mono', monospace;
  font-size: 0.7rem;
  font-weight: 700;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}

.subscription-list__title {
  margin: 0.35rem 0 0;
  color: var(--text-main);
  font-family: 'Syne', sans-serif;
  font-size: clamp(1.2rem, 2vw, 1.45rem);
  letter-spacing: -0.025em;
}

.subscription-list__metrics {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}

.subscription-list__metric,
.subscription-list__count,
.subscription-status {
  display: inline-flex;
  align-items: center;
  min-height: 30px;
  border-radius: 999px;
  font-size: 0.73rem;
  font-weight: 700;
}

.subscription-list__metric {
  gap: 0.3rem;
  padding: 0.25rem 0.65rem;
  border: 1px solid var(--line);
  background: var(--bg-panel);
  color: var(--text-muted);
}

.subscription-list__metric strong {
  color: var(--text-main);
  font-family: 'DM Mono', monospace;
}

.subscription-list__count {
  padding: 0.25rem 0.7rem;
  border: 1px solid var(--line);
  color: var(--text-muted);
}

.subscription-list__empty {
  margin: 0;
  padding: 3rem 1.5rem;
  color: var(--text-muted);
  text-align: center;
}

.subscription-list__items {
  display: grid;
  gap: 0.75rem;
  margin: 0;
  padding: 0.9rem;
  list-style: none;
}

.subscription-card {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  padding: 1rem;
  border: 1px solid var(--line);
  border-radius: var(--radius-md);
  background: var(--bg-subtle);
  transition:
    border-color 0.15s,
    box-shadow 0.15s,
    transform 0.15s;
}

.subscription-card:hover {
  border-color: var(--line-strong);
  box-shadow: var(--shadow-soft);
  transform: translateY(-1px);
}

.subscription-card__main {
  min-width: 0;
}

.subscription-card__heading,
.subscription-card__side,
.subscription-card__actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.55rem;
}

.subscription-card__heading strong {
  color: var(--text-main);
  font-size: 0.98rem;
}

.subscription-status {
  padding: 0.1rem 0.5rem;
}

.subscription-status--active {
  background: color-mix(in srgb, var(--income) 14%, transparent);
  color: var(--income);
}

.subscription-status--paused {
  background: color-mix(in srgb, var(--text-muted) 14%, transparent);
  color: var(--text-muted);
}

.subscription-card__meta,
.subscription-card__next-charge {
  margin: 0.4rem 0 0;
  color: var(--text-muted);
  font-size: 0.86rem;
  line-height: 1.45;
}

.subscription-card__next-charge time {
  color: var(--text-main);
  font-family: 'DM Mono', monospace;
  font-size: 0.82rem;
}

.subscription-card__side {
  justify-content: flex-end;
}

.subscription-card__amount {
  margin-right: 0.35rem;
  color: var(--text-main);
  font-family: 'DM Mono', monospace;
  font-size: 1.05rem;
  font-variant-numeric: tabular-nums;
}

.subscription-icon-button,
.subscription-delete-button {
  min-height: 42px;
  border-radius: var(--radius-md);
  font: inherit;
  font-size: 0.84rem;
  font-weight: 700;
  cursor: pointer;
  transition:
    background 0.15s,
    border-color 0.15s,
    box-shadow 0.15s;
}

.subscription-icon-button {
  padding: 0.55rem 0.75rem;
  border: 1px solid var(--line);
  background: var(--bg-panel);
  color: var(--text-main);
}

.subscription-icon-button:hover {
  border-color: var(--line-strong);
  background: color-mix(in srgb, var(--primary) 7%, var(--bg-panel));
}

.subscription-delete-button {
  padding: 0.55rem 0.75rem;
  border: 1px solid transparent;
  background: transparent;
  color: var(--expense);
}

.subscription-delete-button:hover {
  border-color: color-mix(in srgb, var(--expense) 35%, transparent);
  background: color-mix(in srgb, var(--expense) 12%, var(--bg-panel));
}

.subscription-icon-button:focus-visible,
.subscription-delete-button:focus-visible {
  border-color: var(--primary);
  outline: none;
  box-shadow: 0 0 0 3px var(--ring);
}

@media (max-width: 720px) {
  .subscription-card__side {
    width: 100%;
    justify-content: space-between;
  }
}

@media (max-width: 460px) {
  .subscription-list__header {
    padding: 1rem;
  }

  .subscription-card__side,
  .subscription-card__actions {
    align-items: stretch;
  }

  .subscription-card__actions {
    width: 100%;
  }

  .subscription-icon-button,
  .subscription-delete-button {
    flex: 1 1 0;
  }
}
</style>
