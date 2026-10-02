<script setup lang="ts">
import { frequencyLabel } from '../../../domain/recurring/occurrences'
import type { RecurringRule } from '../../../scripts/types'

defineProps<{ rules: RecurringRule[] }>()

const emit = defineEmits<{
  edit: [rule: RecurringRule]
  toggle: [id: string, active: boolean]
  delete: [id: string]
}>()
</script>

<template>
  <p v-if="!rules.length" class="investment-recurring-empty">
    Aún no hay compras recurrentes. Crea una y sus vencimientos aparecerán como pendientes.
  </p>
  <div v-else class="list-stack">
    <article v-for="rule in rules" :key="rule.id" class="list-item">
      <div>
        <strong>{{ rule.description }}</strong>
        <p class="text-text-muted text-sm">
          {{ frequencyLabel(rule.frequency) }} · próxima: {{ rule.nextOccurrenceDate || '—' }} ·
          {{ rule.amount.toFixed(2) }} · {{ rule.symbol || 'Sin símbolo' }}
        </p>
      </div>
      <div class="investment-recurring-actions">
        <label class="investment-recurring-toggle">
          <input
            type="checkbox"
            :checked="rule.active"
            @change="emit('toggle', rule.id, ($event.target as HTMLInputElement).checked)"
          />
          Activa
        </label>
        <button type="button" class="secondary-btn" @click="emit('edit', rule)">Editar</button>
        <button type="button" class="danger-btn" @click="emit('delete', rule.id)">Eliminar</button>
      </div>
    </article>
  </div>
</template>

<style scoped>
.investment-recurring-empty {
  margin: 0;
  color: var(--text-muted);
  font-size: 0.9rem;
}

.investment-recurring-actions,
.investment-recurring-toggle {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.investment-recurring-actions {
  flex-wrap: wrap;
}

.investment-recurring-toggle {
  font-size: 0.88rem;
}
</style>
