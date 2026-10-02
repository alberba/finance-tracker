<script setup lang="ts">
import { computed } from 'vue'

import { useMoneyFormatter } from '../../composables/useMoneyFormatter'
import { analyzeSubscriptions } from '../../domain/subscriptions/analysis'
import type { Subscription } from '../../scripts/types'

const props = defineProps<{ subscriptions: Subscription[] }>()

const { formatMoney } = useMoneyFormatter()
const analysis = computed(() => analyzeSubscriptions(props.subscriptions))
</script>

<template>
  <section class="subscription-analysis" aria-labelledby="subscription-analysis-title">
    <header class="subscription-analysis__header">
      <div>
        <p class="subscription-analysis__eyebrow">Ritmo de gasto</p>
        <h3 id="subscription-analysis-title" class="subscription-analysis__title">
          Análisis de suscripciones
        </h3>
      </div>
      <span class="subscription-analysis__active-count">
        {{ analysis.activeCount }} activas
      </span>
    </header>

    <div v-if="analysis.activeCount" class="subscription-analysis__content">
      <dl class="subscription-analysis__totals">
        <div class="subscription-analysis__total subscription-analysis__total--primary">
          <dt>Coste mensual equivalente</dt>
          <dd>{{ formatMoney(analysis.monthlyEquivalent) }}</dd>
          <span>promedio para comparar frecuencias</span>
        </div>
        <div class="subscription-analysis__total">
          <dt>Proyección anual</dt>
          <dd>{{ formatMoney(analysis.annualTotal) }}</dd>
          <span>si mantienes las suscripciones activas</span>
        </div>
      </dl>

      <ul class="subscription-analysis__frequencies" aria-label="Desglose por frecuencia">
        <li
          v-for="frequency in analysis.byFrequency"
          :key="frequency.frequency"
          class="subscription-frequency"
        >
          <div class="subscription-frequency__heading">
            <strong>{{ frequency.label }}</strong>
            <span>{{ frequency.activeCount }}</span>
          </div>
          <p>{{ formatMoney(frequency.monthlyEquivalent) }}<small>/mes</small></p>
          <span>{{ formatMoney(frequency.annualTotal) }} al año</span>
        </li>
      </ul>
    </div>

    <p v-else class="subscription-analysis__empty">
      Activa o añade una suscripción para comparar su impacto mensual y anual.
    </p>
  </section>
</template>

<style scoped>
.subscription-analysis {
  overflow: hidden;
  border: 1px solid var(--line);
  border-radius: var(--radius-lg);
  background:
    radial-gradient(circle at 92% 8%, color-mix(in srgb, var(--primary) 14%, transparent), transparent 32%),
    var(--bg-panel);
  box-shadow: var(--shadow-soft);
}

.subscription-analysis__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  padding: clamp(1.1rem, 2vw, 1.5rem);
  border-bottom: 1px solid var(--line);
}

.subscription-analysis__eyebrow {
  margin: 0;
  color: var(--primary);
  font-family: 'DM Mono', monospace;
  font-size: 0.7rem;
  font-weight: 700;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}

.subscription-analysis__title {
  margin: 0.35rem 0 0;
  color: var(--text-main);
  font-family: 'Syne', sans-serif;
  font-size: clamp(1.2rem, 2vw, 1.45rem);
  letter-spacing: -0.025em;
}

.subscription-analysis__active-count {
  flex: none;
  padding: 0.3rem 0.7rem;
  border: 1px solid color-mix(in srgb, var(--primary) 30%, var(--line));
  border-radius: 999px;
  background: color-mix(in srgb, var(--primary) 8%, var(--bg-panel));
  color: var(--primary);
  font-size: 0.73rem;
  font-weight: 700;
}

.subscription-analysis__content {
  display: grid;
  grid-template-columns: minmax(260px, 0.8fr) minmax(0, 1.2fr);
  gap: 1rem;
  padding: clamp(1rem, 2vw, 1.5rem);
}

.subscription-analysis__totals {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0.75rem;
  margin: 0;
}

.subscription-analysis__total {
  display: flex;
  flex-direction: column;
  justify-content: center;
  min-height: 126px;
  padding: 1rem;
  border: 1px solid var(--line);
  border-radius: var(--radius-md);
  background: color-mix(in srgb, var(--bg-subtle) 82%, transparent);
}

.subscription-analysis__total--primary {
  border-color: color-mix(in srgb, var(--primary) 30%, var(--line));
  background: color-mix(in srgb, var(--primary) 8%, var(--bg-panel));
}

.subscription-analysis__total dt,
.subscription-analysis__total span {
  color: var(--text-muted);
  font-size: 0.72rem;
  line-height: 1.35;
}

.subscription-analysis__total dt {
  font-weight: 700;
}

.subscription-analysis__total dd {
  margin: 0.45rem 0 0.35rem;
  color: var(--text-main);
  font-family: 'DM Mono', monospace;
  font-size: clamp(1.2rem, 2.5vw, 1.65rem);
  font-weight: 700;
  letter-spacing: -0.04em;
  font-variant-numeric: tabular-nums;
}

.subscription-analysis__frequencies {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0.75rem;
  margin: 0;
  padding: 0;
  list-style: none;
}

.subscription-frequency {
  min-width: 0;
  padding: 0.85rem 0.95rem;
  border: 1px solid var(--line);
  border-radius: var(--radius-md);
  background: var(--bg-subtle);
}

.subscription-frequency__heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
}

.subscription-frequency__heading strong {
  color: var(--text-main);
  font-size: 0.82rem;
}

.subscription-frequency__heading span {
  display: grid;
  min-width: 24px;
  min-height: 24px;
  place-items: center;
  border-radius: 999px;
  background: color-mix(in srgb, var(--primary) 10%, var(--bg-panel));
  color: var(--primary);
  font-family: 'DM Mono', monospace;
  font-size: 0.7rem;
  font-weight: 700;
}

.subscription-frequency p {
  margin: 0.75rem 0 0.25rem;
  color: var(--text-main);
  font-family: 'DM Mono', monospace;
  font-size: 1.05rem;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}

.subscription-frequency p small,
.subscription-frequency > span {
  color: var(--text-muted);
  font-family: inherit;
  font-size: 0.7rem;
  font-weight: 500;
}

.subscription-frequency p small {
  margin-left: 0.2rem;
}

.subscription-analysis__empty {
  margin: 0;
  padding: 2rem 1.5rem;
  color: var(--text-muted);
  text-align: center;
}

@media (max-width: 900px) {
  .subscription-analysis__content {
    grid-template-columns: minmax(0, 1fr);
  }
}

@media (max-width: 560px) {
  .subscription-analysis__totals,
  .subscription-analysis__frequencies {
    grid-template-columns: minmax(0, 1fr);
  }

  .subscription-analysis__header {
    align-items: flex-start;
  }
}
</style>
