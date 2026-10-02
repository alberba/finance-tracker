<script setup lang="ts">
import { computed } from 'vue'

import { useMoneyFormatter } from '../../composables/useMoneyFormatter'
import { buildSubscriptionAnalysis } from '../../domain/subscriptions/analysis'
import type { Entity, Subscription } from '../../scripts/types'
import { todayISO } from '../../scripts/utils'

const props = defineProps<{
  isActive: boolean
  subscriptions: Subscription[]
  accounts: Entity[]
}>()

const { formatMoney } = useMoneyFormatter()
const analysis = computed(() => buildSubscriptionAnalysis(props.subscriptions, todayISO()))
const accountNames = computed(
  () => new Map(props.accounts.map((account) => [account.id, account.name])),
)
const largestCostShare = computed(() => {
  const first = analysis.value.topCosts[0]
  if (!first || analysis.value.annualCommitment <= 0) return 0
  return first.annualAmount / analysis.value.annualCommitment
})

function percent(value: number): string {
  return new Intl.NumberFormat('es-ES', {
    style: 'percent',
    maximumFractionDigits: 0,
  }).format(value)
}

function accountName(accountId: string): string {
  return accountNames.value.get(accountId) || accountId
}

function upcomingLabel(days: number): string {
  if (days === 0) return 'Hoy'
  if (days === 1) return 'Mañana'
  return `En ${days} días`
}
</script>

<template>
  <section
    id="transactions-tab-analysis"
    class="subscription-analysis"
    :hidden="!isActive"
    role="tabpanel"
    aria-labelledby="transactions-tab-analysis-button"
  >
    <header class="subscription-analysis__hero">
      <div>
        <p class="subscription-analysis__eyebrow">Coste recurrente</p>
        <h3>Radar de suscripciones</h3>
        <p>Convierte todas las frecuencias a una base comparable y localiza dónde se concentra el gasto.</p>
      </div>
      <span class="subscription-analysis__active-count">
        {{ analysis.activeCount }} activas · {{ analysis.pausedCount }} pausadas
      </span>
    </header>

    <div v-if="!subscriptions.length" class="subscription-analysis__empty">
      Añade una suscripción para empezar a construir el análisis.
    </div>

    <template v-else>
      <div class="subscription-analysis__metrics" aria-label="Indicadores de suscripciones">
        <article class="analysis-metric analysis-metric--primary">
          <span>Compromiso mensual</span>
          <strong>{{ formatMoney(analysis.monthlyCommitment) }}</strong>
          <small>Promedio normalizado</small>
        </article>
        <article class="analysis-metric">
          <span>Proyección anual</span>
          <strong>{{ formatMoney(analysis.annualCommitment) }}</strong>
          <small>Con las activas actuales</small>
        </article>
        <article class="analysis-metric">
          <span>Próximos 30 días</span>
          <strong>{{ formatMoney(analysis.next30DaysAmount) }}</strong>
          <small>{{ analysis.upcomingCharges.length }} cobros previstos</small>
        </article>
        <article class="analysis-metric analysis-metric--saved">
          <span>Coste anual pausado</span>
          <strong>{{ formatMoney(analysis.pausedAnnualAmount) }}</strong>
          <small>Impacto evitado si siguen pausadas</small>
        </article>
      </div>

      <div class="subscription-analysis__grid">
        <article class="analysis-panel analysis-panel--categories">
          <header>
            <div>
              <p>Distribución</p>
              <h4>Por categoría</h4>
            </div>
            <span>Equivalente mensual</span>
          </header>
          <ol v-if="analysis.categoryBreakdown.length" class="analysis-bars">
            <li v-for="row in analysis.categoryBreakdown" :key="row.label">
              <div class="analysis-bars__label">
                <strong>{{ row.label }}</strong>
                <span>{{ formatMoney(row.monthlyAmount) }} · {{ percent(row.share) }}</span>
              </div>
              <div class="analysis-bars__track" aria-hidden="true">
                <span :style="{ width: `${Math.max(row.share * 100, 2)}%` }"></span>
              </div>
            </li>
          </ol>
          <p v-else class="analysis-panel__empty">No hay suscripciones activas.</p>
        </article>

        <article class="analysis-panel">
          <header>
            <div>
              <p>Prioridad</p>
              <h4>Mayores costes</h4>
            </div>
            <span>Anualizado</span>
          </header>
          <ol v-if="analysis.topCosts.length" class="analysis-ranking">
            <li v-for="(row, index) in analysis.topCosts" :key="row.id">
              <span class="analysis-ranking__position">{{ String(index + 1).padStart(2, '0') }}</span>
              <div>
                <strong>{{ row.name }}</strong>
                <small>{{ row.category }} · {{ formatMoney(row.monthlyAmount) }}/mes</small>
              </div>
              <strong>{{ formatMoney(row.annualAmount) }}</strong>
            </li>
          </ol>
          <p v-else class="analysis-panel__empty">No hay costes activos que ordenar.</p>
        </article>

        <article class="analysis-panel">
          <header>
            <div>
              <p>Calendario</p>
              <h4>Próximos cobros</h4>
            </div>
            <span>30 días</span>
          </header>
          <ol v-if="analysis.upcomingCharges.length" class="analysis-upcoming">
            <li v-for="charge in analysis.upcomingCharges" :key="charge.id">
              <time :datetime="charge.date">
                <strong>{{ upcomingLabel(charge.daysUntilCharge) }}</strong>
                <small>{{ charge.date }}</small>
              </time>
              <span>{{ charge.name }}</span>
              <strong>{{ formatMoney(charge.amount) }}</strong>
            </li>
          </ol>
          <p v-else class="analysis-panel__empty">Sin cobros previstos en los próximos 30 días.</p>
        </article>

        <article class="analysis-panel">
          <header>
            <div>
              <p>Origen</p>
              <h4>Por cuenta</h4>
            </div>
            <span>Mensual</span>
          </header>
          <ol v-if="analysis.accountBreakdown.length" class="analysis-accounts">
            <li v-for="row in analysis.accountBreakdown" :key="row.label">
              <span>{{ accountName(row.label) }}</span>
              <strong>{{ formatMoney(row.monthlyAmount) }}</strong>
              <small>{{ percent(row.share) }} del compromiso</small>
            </li>
          </ol>
          <p v-else class="analysis-panel__empty">No hay cuentas con suscripciones activas.</p>
        </article>
      </div>

      <aside v-if="analysis.topCosts[0]" class="subscription-analysis__insight">
        <span>Lectura rápida</span>
        <p>
          <strong>{{ analysis.topCosts[0].name }}</strong> concentra
          {{ percent(largestCostShare) }} del coste anual. Revisar primero los servicios con mayor
          impacto acelera cualquier ajuste.
        </p>
      </aside>
    </template>
  </section>
</template>

<style scoped>
.subscription-analysis {
  display: grid;
  gap: 1rem;
}

.subscription-analysis__hero {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  justify-content: space-between;
  gap: 1rem;
  overflow: hidden;
  border: 1px solid var(--line);
  border-radius: var(--radius-lg);
  background:
    radial-gradient(circle at 92% 12%, color-mix(in srgb, var(--primary) 26%, transparent), transparent 34%),
    linear-gradient(135deg, var(--bg-sidebar), color-mix(in srgb, var(--bg-sidebar) 82%, var(--primary)));
  padding: clamp(1.25rem, 3vw, 2rem);
  color: var(--ink-text);
}

.subscription-analysis__hero h3,
.subscription-analysis__hero p {
  margin: 0;
}

.subscription-analysis__hero h3 {
  margin-top: 0.35rem;
  font-family: 'Syne', sans-serif;
  font-size: clamp(1.55rem, 3vw, 2.2rem);
  letter-spacing: -0.035em;
}

.subscription-analysis__hero > div > p:last-child {
  max-width: 42rem;
  margin-top: 0.55rem;
  color: var(--ink-muted);
}

.subscription-analysis__eyebrow,
.analysis-panel header p {
  color: color-mix(in srgb, var(--primary-light) 80%, white);
  font-family: 'DM Mono', monospace;
  font-size: 0.68rem;
  font-weight: 700;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}

.subscription-analysis__active-count {
  border: 1px solid color-mix(in srgb, white 18%, transparent);
  border-radius: 999px;
  background: color-mix(in srgb, white 8%, transparent);
  padding: 0.45rem 0.8rem;
  color: var(--ink-text);
  font-size: 0.75rem;
  font-weight: 700;
}

.subscription-analysis__metrics {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 0.75rem;
}

.analysis-metric,
.analysis-panel,
.subscription-analysis__empty {
  border: 1px solid var(--line);
  border-radius: var(--radius-lg);
  background: var(--bg-panel);
  box-shadow: var(--shadow-soft);
}

.analysis-metric {
  display: grid;
  gap: 0.35rem;
  padding: 1rem;
}

.analysis-metric span,
.analysis-metric small,
.analysis-panel header > span,
.analysis-ranking small,
.analysis-upcoming small,
.analysis-accounts small {
  color: var(--text-muted);
  font-size: 0.72rem;
}

.analysis-metric strong {
  color: var(--text-main);
  font-family: 'DM Mono', monospace;
  font-size: clamp(1.2rem, 2vw, 1.55rem);
}

.analysis-metric--primary {
  border-color: color-mix(in srgb, var(--primary) 38%, var(--line));
  background: color-mix(in srgb, var(--primary) 7%, var(--bg-panel));
}

.analysis-metric--saved strong {
  color: var(--income);
}

.subscription-analysis__grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 1rem;
}

.analysis-panel {
  overflow: hidden;
}

.analysis-panel header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  border-bottom: 1px solid var(--line);
  padding: 1rem 1.1rem;
}

.analysis-panel header p {
  margin: 0;
  color: var(--primary);
}

.analysis-panel h4 {
  margin: 0.2rem 0 0;
  color: var(--text-main);
  font-family: 'Syne', sans-serif;
  font-size: 1.05rem;
}

.analysis-bars,
.analysis-ranking,
.analysis-upcoming,
.analysis-accounts {
  display: grid;
  gap: 0;
  margin: 0;
  padding: 0.6rem 1.1rem 0.9rem;
  list-style: none;
}

.analysis-bars li {
  display: grid;
  gap: 0.45rem;
  padding: 0.65rem 0;
}

.analysis-bars__label,
.analysis-ranking li,
.analysis-upcoming li,
.analysis-accounts li {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
}

.analysis-bars__label strong,
.analysis-ranking strong,
.analysis-upcoming strong,
.analysis-accounts strong {
  color: var(--text-main);
}

.analysis-bars__label span {
  color: var(--text-muted);
  font-family: 'DM Mono', monospace;
  font-size: 0.72rem;
}

.analysis-bars__track {
  height: 7px;
  overflow: hidden;
  border-radius: 999px;
  background: var(--track-bg);
}

.analysis-bars__track span {
  display: block;
  height: 100%;
  border-radius: inherit;
  background: linear-gradient(90deg, var(--primary), var(--invest));
}

.analysis-ranking li,
.analysis-upcoming li,
.analysis-accounts li {
  min-height: 58px;
  border-bottom: 1px solid var(--line);
}

.analysis-ranking li:last-child,
.analysis-upcoming li:last-child,
.analysis-accounts li:last-child {
  border-bottom: 0;
}

.analysis-ranking__position {
  color: var(--text-faint);
  font-family: 'DM Mono', monospace;
  font-size: 0.72rem;
}

.analysis-ranking li > div {
  display: grid;
  flex: 1;
  gap: 0.15rem;
}

.analysis-upcoming time {
  display: grid;
  min-width: 6.5rem;
}

.analysis-upcoming > li > span {
  flex: 1;
  color: var(--text-main);
}

.analysis-accounts li {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
}

.analysis-accounts small {
  grid-column: 1 / -1;
}

.analysis-panel__empty,
.subscription-analysis__empty {
  margin: 0;
  padding: 2rem 1.1rem;
  color: var(--text-muted);
  text-align: center;
}

.subscription-analysis__insight {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  align-items: center;
  gap: 0.9rem;
  border: 1px solid color-mix(in srgb, var(--accent) 35%, var(--line));
  border-radius: var(--radius-md);
  background: color-mix(in srgb, var(--accent) 9%, var(--bg-panel));
  padding: 0.9rem 1rem;
}

.subscription-analysis__insight span {
  border-radius: 999px;
  background: var(--accent);
  padding: 0.3rem 0.55rem;
  color: #241600;
  font-size: 0.68rem;
  font-weight: 800;
  text-transform: uppercase;
}

.subscription-analysis__insight p {
  margin: 0;
  color: var(--text-muted);
  font-size: 0.85rem;
}

@media (max-width: 980px) {
  .subscription-analysis__metrics,
  .subscription-analysis__grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 640px) {
  .subscription-analysis__metrics,
  .subscription-analysis__grid {
    grid-template-columns: 1fr;
  }

  .subscription-analysis__insight {
    grid-template-columns: 1fr;
  }

  .analysis-upcoming li {
    display: grid;
    grid-template-columns: 1fr auto;
  }

  .analysis-upcoming time {
    grid-column: 1 / -1;
  }
}
</style>
