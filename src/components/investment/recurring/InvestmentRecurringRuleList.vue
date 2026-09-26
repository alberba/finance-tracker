<script setup lang="ts">
import { useMoneyFormatter } from '../../../composables/useMoneyFormatter'
import { frequencyLabel } from '../../../domain/recurring/occurrences'
import type { RecurringRule } from '../../../scripts/types'

defineProps<{ rules: RecurringRule[] }>()

const emit = defineEmits<{
  edit: [rule: RecurringRule]
  toggle: [id: string, active: boolean]
  delete: [id: string]
}>()

const { formatMoney } = useMoneyFormatter()

function cadence(rule: RecurringRule): string {
  const interval = Math.max(1, rule.interval || 1)
  return interval > 1 ? `${frequencyLabel(rule.frequency)} · cada ${interval}` : frequencyLabel(rule.frequency)
}

function longDate(date: string | undefined): string {
  if (!date) return '—'
  const parsed = new Date(`${date}T00:00:00`)
  if (Number.isNaN(parsed.getTime())) return date
  return new Intl.DateTimeFormat('es-ES', { day: '2-digit', month: 'short', year: 'numeric' })
    .format(parsed)
    .replace('.', '')
}
</script>

<template>
  <p v-if="!rules.length" class="inv-empty">
    Aún no hay compras recurrentes. Crea una y sus vencimientos aparecerán como pendientes.
  </p>
  <div v-else class="inv-ledger-wrap">
    <table class="inv-ledger">
      <thead>
        <tr>
          <th scope="col">Regla</th>
          <th scope="col" class="inv-hide-sm">Frecuencia</th>
          <th scope="col" class="is-right">Importe</th>
          <th scope="col" class="inv-hide-sm">Próximo vencimiento</th>
          <th scope="col">Estado</th>
          <th scope="col" class="is-right">Acciones</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="rule in rules" :key="rule.id" class="inv-rule" :class="{ 'is-paused': !rule.active }" data-recurring-rule>
          <td>
            <span class="inv-cell-name inv-rule__dim">
              <span class="inv-rule-badge">{{ rule.symbol || '—' }}</span>
              <span class="inv-cell-stack">
                <span style="font-weight: 700">{{ rule.description }}</span>
                <small style="font-weight: 400">{{ rule.category }}</small>
              </span>
            </span>
          </td>
          <td class="inv-hide-sm">
            <span class="inv-cell-stack inv-rule__dim">
              <span style="font-weight: 600">{{ cadence(rule) }}</span>
              <small>desde {{ longDate(rule.startDate) }}</small>
            </span>
          </td>
          <td class="is-right inv-num inv-rule__dim" style="font-weight: 500">{{ formatMoney(rule.amount) }}</td>
          <td class="inv-hide-sm">
            <span class="inv-cell-stack">
              <span style="font-weight: 600">{{ rule.active ? longDate(rule.nextOccurrenceDate) : 'En pausa' }}</span>
              <small v-if="!rule.active">No generará pendientes</small>
            </span>
          </td>
          <td>
            <label class="inv-switch">
              <input
                type="checkbox"
                :checked="rule.active"
                @change="emit('toggle', rule.id, ($event.target as HTMLInputElement).checked)"
              />
              <span class="inv-switch__track" aria-hidden="true"></span>
              {{ rule.active ? 'Activa' : 'Pausada' }}
            </label>
          </td>
          <td>
            <div class="inv-actions">
              <button type="button" class="inv-secondary" style="border-color: transparent" @click="emit('edit', rule)">Editar</button>
              <button
                type="button"
                class="inv-icon-btn is-danger"
                :aria-label="`Eliminar la regla ${rule.description}`"
                @click="emit('delete', rule.id)"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 7h16" /><path d="M10 11v6M14 11v6" /><path d="M6 7l1 13h10l1-13" /><path d="M9 7V4h6v3" /></svg>
              </button>
            </div>
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>
